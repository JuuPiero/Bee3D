import { Color, Mat3, Mesh, Quat, Vec3, gfx, primitives } from 'cc';

const { Attribute, AttributeName, Format } = gfx;

/**
 * Geometry helpers for the merged cube grid.
 *
 * The prefab path renders a cube as: PixelBlock -> CubeRoot (rotated) -> Render (scaled),
 * and cubeColor.effect then "un-stretches" the mesh in the vertex shader so the bevel keeps
 * a uniform radius under the non-uniform Render scale. None of that survives a merged mesh,
 * so bakeCubeSource() runs the exact same math on the CPU once and produces the final
 * per-cube geometry, which the builder then just translates per cell.
 */

/** Attribute name for the per-vertex shadow tone (see cubeColorMerged.effect). */
export const ATTR_COLOR_SHADOW = 'a_colorShadow';
/** Attribute name for the pre-baked fake-SSS vector (see cubeColorMerged.effect). */
export const ATTR_CAP_LOCAL = 'a_capLocal';

/** uint16 index buffers cannot address past this, which is what caps a chunk's vertex count. */
const MAX_VERTICES_PER_CHUNK = 65535;

/** One cube's final geometry, relative to its cell, shared by every cube in the grid. */
export interface IBakedCubeSource
{
    /** Final local positions, 3 floats per vertex. */
    positions: Float32Array;
    /** Final local normals, 3 floats per vertex. */
    normals: Float32Array;
    /** Pre-baked a_capLocal, 3 floats per vertex. */
    capLocals: Float32Array;
    /** Triangle indices into the arrays above. */
    indices: Uint16Array;
    vertexCount: number;
    indexCount: number;
}

/** A cube to place in the merged mesh. */
export interface IMergedCube
{
    x: number;
    y: number;
    z: number;
    /** Position of the cell, in the holder's local space. */
    localPos: Vec3;
    /** RGBA bytes for a_color. */
    color: Color;
    /** RGBA bytes for a_colorShadow. */
    shadow: Color;
}

/**
 * Port of the scale-compensation branch in cubeColor-vs. Kept structurally identical to the
 * GLSL (including the `minScale ==` equality tests) so the baked result matches the prefab
 * path exactly rather than approximately.
 */
export function unstretch (position: Vec3, objScale: Vec3, out: Vec3): Vec3
{
    const sx = objScale.x;
    const sy = objScale.y;
    const sz = objScale.z;

    out.set(position.x / sx, position.y / sy, position.z / sz);

    const minScale = Math.min(Math.min(sx, sy), sz);
    const eps = 0.01;

    if (minScale === sx)
    {
        out.multiplyScalar(sx);
        if (position.y > 0.5) out.y += (sy - sx) / sy;
        if (position.z > eps) out.z += (sz - sx) / (sz * 2.0);
        else if (position.z < -eps) out.z -= (sz - sx) / (sz * 2.0);
    }
    else if (minScale === sy)
    {
        out.multiplyScalar(sy);
        if (position.x > eps) out.x += (sx - sy) / (sx * 2.0);
        else if (position.x < -eps) out.x -= (sx - sy) / (sx * 2.0);
        if (position.z > eps) out.z += (sz - sy) / (sz * 2.0);
        else if (position.z < -eps) out.z -= (sz - sy) / (sz * 2.0);
    }
    else
    {
        out.multiplyScalar(sz);
        if (position.x > eps) out.x += (sx - sz) / (sx * 2.0);
        else if (position.x < -eps) out.x -= (sx - sz) / (sx * 2.0);
        if (position.y > 0.5) out.y += (sy - sz) / sy;
    }

    return out;
}

/**
 * Reads one primitive of the source cube mesh and bakes the Render node's scale, the
 * CubeRoot rotation and the shader's un-stretch into a reusable per-cube geometry.
 *
 * Returns null when the mesh has no CPU-side data (an .fbx imported with "release data"
 * enabled would hit this).
 */
export function bakeCubeSource (
    mesh: Mesh,
    primitiveIndex: number,
    cubeScale: Vec3,
    cubeRotationEuler: Vec3
): IBakedCubeSource | null
{
    const rawPositions = mesh.readAttribute(primitiveIndex, AttributeName.ATTR_POSITION);
    const rawNormals = mesh.readAttribute(primitiveIndex, AttributeName.ATTR_NORMAL);
    const rawIndices = mesh.readIndices(primitiveIndex);

    if (!rawPositions || !rawNormals || !rawIndices)
    {
        return null;
    }

    const vertexCount = rawPositions.length / 3;
    const indexCount = rawIndices.length;

    if (vertexCount > MAX_VERTICES_PER_CHUNK)
    {
        return null;
    }

    const rotation = Quat.fromEuler(new Quat(), cubeRotationEuler.x, cubeRotationEuler.y, cubeRotationEuler.z);
    const rotationMat = Mat3.fromQuat(new Mat3(), rotation);

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const capLocals = new Float32Array(vertexCount * 3);

    const source = new Vec3();
    const local = new Vec3();
    const work = new Vec3();

    for (let i = 0; i < vertexCount; i++)
    {
        const o = i * 3;

        // Final position: R * (S * unstretch(p, S)) -- what matWorld * pos evaluated to.
        source.set(rawPositions[o], rawPositions[o + 1], rawPositions[o + 2]);
        unstretch(source, cubeScale, local);

        work.set(local.x * cubeScale.x, local.y * cubeScale.y, local.z * cubeScale.z);
        Vec3.transformMat3(work, work, rotationMat);
        positions[o] = work.x;
        positions[o + 1] = work.y;
        positions[o + 2] = work.z;

        // Normal: the inverse-transpose of R * S is R * S^-1 for a diagonal S.
        work.set(
            rawNormals[o] / cubeScale.x,
            rawNormals[o + 1] / cubeScale.y,
            rawNormals[o + 2] / cubeScale.z
        );
        Vec3.transformMat3(work, work, rotationMat);
        work.normalize();
        normals[o] = work.x;
        normals[o + 1] = work.y;
        normals[o + 2] = work.z;

        // a_capLocal: ((R * (S * (unstretched - (0, 0.5, 0)))) / S), i.e. the original
        // `worldPosNoTrans` with the cube's own transform already folded in.
        work.set(local.x * cubeScale.x, (local.y - 0.5) * cubeScale.y, local.z * cubeScale.z);
        Vec3.transformMat3(work, work, rotationMat);
        capLocals[o] = work.x / cubeScale.x;
        capLocals[o + 1] = work.y / cubeScale.y;
        capLocals[o + 2] = work.z / cubeScale.z;
    }

    const indices = new Uint16Array(indexCount);
    indices.set(rawIndices as unknown as ArrayLike<number>);

    return { positions, normals, capLocals, indices, vertexCount, indexCount };
}

/** Vertex streams for one chunk, plus the scratch index array the chunk draws from. */
export class GridMeshChunk
{
    public readonly positions: Float32Array;
    public readonly normals: Float32Array;
    public readonly capLocals: Float32Array;

    /**
     * a_color / a_colorShadow are RGBA8 like the instanced path they replace, but
     * IDynamicGeometry.customAttributes types its payload as Float32Array. The engine only
     * ever reads .buffer/.byteOffset/.byteLength off it, so these are float views over the
     * byte arrays below. RGBA8 is 4 bytes per vertex, so the view is always 4-byte aligned.
     */
    public readonly colorBytes: Uint8Array;
    public readonly shadowBytes: Uint8Array;
    public readonly colorView: Float32Array;
    public readonly shadowView: Float32Array;

    /** Indices of the currently visible cubes, packed into the front of the array. */
    public readonly indices: Uint16Array;

    /** AABB over every cube written into this chunk, visible or not. */
    public readonly minPos = new Vec3(Infinity, Infinity, Infinity);
    public readonly maxPos = new Vec3(-Infinity, -Infinity, -Infinity);

    public cubeCount = 0;
    /** Number of cubes currently occupying a slot at the front of `indices`. */
    public liveCount = 0;
    /** Set when `indices`/`liveCount` changed since the last upload; cleared by the owner. */
    public dirty = false;

    constructor (
        public readonly index: number,
        public readonly capacity: number,
        verticesPerCube: number,
        indicesPerCube: number
    )
    {
        const vertexCount = capacity * verticesPerCube;

        this.positions = new Float32Array(vertexCount * 3);
        this.normals = new Float32Array(vertexCount * 3);
        this.capLocals = new Float32Array(vertexCount * 3);

        this.colorBytes = new Uint8Array(vertexCount * 4);
        this.shadowBytes = new Uint8Array(vertexCount * 4);
        this.colorView = new Float32Array(this.colorBytes.buffer, 0, vertexCount);
        this.shadowView = new Float32Array(this.shadowBytes.buffer, 0, vertexCount);

        this.indices = new Uint16Array(capacity * indicesPerCube);
    }
}

/**
 * Splits cubes into chunks and fills each chunk's vertex streams.
 *
 * Chunks are packed in fill order rather than by grid region on purpose: a spatial partition
 * would leave partly filled chunks all over the grid, and every chunk costs a preallocated
 * vertex buffer sized to its capacity. Callers that want spatial locality should sort `cubes`
 * before calling, which keeps fill order and grid neighbourhoods close to each other.
 *
 * `cubesPerChunkHint` is what trades draw calls against re-upload cost. One huge chunk is the
 * fewest draw calls but re-uploads the whole grid whenever a single cube changes; smaller
 * chunks mean more draw calls but a rebuild that touches only the chunks that actually changed.
 * The hint is clamped to what a uint16 index buffer can address.
 */
export class GridMeshBuilder
{
    public readonly chunks: GridMeshChunk[] = [];
    public readonly cubesPerChunk: number;
    public readonly verticesPerCube: number;
    public readonly indicesPerCube: number;

    constructor (private readonly _source: IBakedCubeSource, cubeCount: number, cubesPerChunkHint: number = 0)
    {
        this.verticesPerCube = _source.vertexCount;
        this.indicesPerCube = _source.indexCount;

        const vertexLimit = Math.max(1, Math.floor(MAX_VERTICES_PER_CHUNK / this.verticesPerCube));
        this.cubesPerChunk = cubesPerChunkHint > 0
            ? Math.max(1, Math.min(Math.floor(cubesPerChunkHint), vertexLimit))
            : vertexLimit;

        const chunkCount = Math.max(1, Math.ceil(cubeCount / this.cubesPerChunk));

        for (let i = 0; i < chunkCount; i++)
        {
            const remaining = cubeCount - i * this.cubesPerChunk;
            const capacity = Math.max(1, Math.min(this.cubesPerChunk, remaining));
            this.chunks.push(new GridMeshChunk(i, capacity, this.verticesPerCube, this.indicesPerCube));
        }
    }

    public get maxSubMeshVertices (): number
    {
        return this.cubesPerChunk * this.verticesPerCube;
    }

    public get maxSubMeshIndices (): number
    {
        return this.cubesPerChunk * this.indicesPerCube;
    }

    /**
     * Buffer sizes for a mesh that holds this chunk alone. The last chunk is usually short, and
     * a chunk never grows past the capacity it was built with, so sizing per chunk instead of
     * with maxSubMeshVertices avoids preallocating vertex buffers for cubes that don't exist.
     */
    public chunkMaxVertices (chunk: GridMeshChunk): number
    {
        return chunk.capacity * this.verticesPerCube;
    }

    public chunkMaxIndices (chunk: GridMeshChunk): number
    {
        return chunk.capacity * this.indicesPerCube;
    }

    public getLiveIndexCount (chunk: GridMeshChunk): number
    {
        return chunk.liveCount * this.indicesPerCube;
    }

    /**
     * Writes one cube's vertices into its chunk. Vertex data is written for every cube in
     * the level, visible or not, so that later visibility changes only ever rewrite indices.
     */
    public writeCube (ordinal: number, cube: IMergedCube): void
    {
        const chunk = this.chunks[Math.floor(ordinal / this.cubesPerChunk)];
        const localOrdinal = ordinal % this.cubesPerChunk;
        const vertexBase = localOrdinal * this.verticesPerCube;

        const source = this._source;
        const px = cube.localPos.x;
        const py = cube.localPos.y;
        const pz = cube.localPos.z;

        for (let i = 0; i < this.verticesPerCube; i++)
        {
            const src = i * 3;
            const dst = (vertexBase + i) * 3;

            const wx = source.positions[src] + px;
            const wy = source.positions[src + 1] + py;
            const wz = source.positions[src + 2] + pz;

            chunk.positions[dst] = wx;
            chunk.positions[dst + 1] = wy;
            chunk.positions[dst + 2] = wz;

            if (wx < chunk.minPos.x) chunk.minPos.x = wx;
            if (wy < chunk.minPos.y) chunk.minPos.y = wy;
            if (wz < chunk.minPos.z) chunk.minPos.z = wz;
            if (wx > chunk.maxPos.x) chunk.maxPos.x = wx;
            if (wy > chunk.maxPos.y) chunk.maxPos.y = wy;
            if (wz > chunk.maxPos.z) chunk.maxPos.z = wz;

            chunk.normals[dst] = source.normals[src];
            chunk.normals[dst + 1] = source.normals[src + 1];
            chunk.normals[dst + 2] = source.normals[src + 2];

            chunk.capLocals[dst] = source.capLocals[src];
            chunk.capLocals[dst + 1] = source.capLocals[src + 1];
            chunk.capLocals[dst + 2] = source.capLocals[src + 2];

            const c = (vertexBase + i) * 4;
            chunk.colorBytes[c] = cube.color.r;
            chunk.colorBytes[c + 1] = cube.color.g;
            chunk.colorBytes[c + 2] = cube.color.b;
            chunk.colorBytes[c + 3] = cube.color.a;

            chunk.shadowBytes[c] = cube.shadow.r;
            chunk.shadowBytes[c + 1] = cube.shadow.g;
            chunk.shadowBytes[c + 2] = cube.shadow.b;
            chunk.shadowBytes[c + 3] = cube.shadow.a;
        }

        chunk.cubeCount = Math.max(chunk.cubeCount, localOrdinal + 1);
    }

    /**
     * Copies one cube's triangle indices into a slot of its chunk's packed index array.
     * `localOrdinal` selects which cube's vertices to reference, `slot` where in the draw
     * range those triangles live.
     */
    public writeIndices (chunk: GridMeshChunk, localOrdinal: number, slot: number): void
    {
        const source = this._source.indices;
        const vertexBase = localOrdinal * this.verticesPerCube;
        const indexBase = slot * this.indicesPerCube;

        for (let i = 0; i < this.indicesPerCube; i++)
        {
            chunk.indices[indexBase + i] = vertexBase + source[i];
        }
    }

    /** Full geometry for a chunk, used on creation and whenever vertex data changes. */
    public buildGeometry (chunk: GridMeshChunk): primitives.IDynamicGeometry
    {
        const vertexCount = chunk.cubeCount * this.verticesPerCube;

        // Both tones go through customAttributes rather than IDynamicGeometry.colors:
        // createDynamicMesh hard-codes that channel to RGBA32F, and matching the RGBA8 the
        // instanced path already used keeps the vertex streams four times smaller.
        return {
            positions: chunk.positions.subarray(0, vertexCount * 3),
            normals: chunk.normals.subarray(0, vertexCount * 3),
            customAttributes: [
                {
                    attr: new Attribute(AttributeName.ATTR_COLOR, Format.RGBA8, true, 0, false, 0),
                    values: chunk.colorView.subarray(0, vertexCount),
                },
                {
                    attr: new Attribute(ATTR_COLOR_SHADOW, Format.RGBA8, true, 0, false, 0),
                    values: chunk.shadowView.subarray(0, vertexCount),
                },
                {
                    attr: new Attribute(ATTR_CAP_LOCAL, Format.RGB32F, false, 0, false, 0),
                    values: chunk.capLocals.subarray(0, vertexCount * 3),
                },
            ],
            indices16: chunk.indices.subarray(0, this.getLiveIndexCount(chunk)),
            minPos: chunk.minPos,
            maxPos: chunk.maxPos,
        };
    }
}

/** Shared empty stream: Mesh.updateSubMesh skips any vertex buffer of length 0. */
const NO_VERTEX_DATA = new Float32Array(0);

/**
 * Geometry that carries a chunk's index range and nothing else.
 *
 * Mesh.updateSubMesh only pushes a vertex stream when its array is non-empty, and it leaves
 * the corresponding vertex buffer, its view count and drawInfo.vertexCount untouched
 * otherwise - so passing this re-uploads the index buffer alone and keeps the vertex data
 * that buildGeometry() already put on the GPU. Use it for visibility-only changes; anything
 * that rewrites vertices has to go through buildGeometry().
 *
 * minPos/maxPos are deliberately omitted: the chunk's bounds cover every cube written into
 * it, visible or not, so hiding cubes never shrinks them and there is nothing to re-send.
 */
export function buildIndexOnlyGeometry (chunk: GridMeshChunk, indicesPerCube: number): primitives.IDynamicGeometry
{
    return {
        positions: NO_VERTEX_DATA,
        indices16: chunk.indices.subarray(0, chunk.liveCount * indicesPerCube),
    };
}

