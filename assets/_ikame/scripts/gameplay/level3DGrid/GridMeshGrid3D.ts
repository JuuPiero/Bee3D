import { _decorator, CCInteger, Color, Component, Material, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';
import { ColorConfig } from '../../configData/ColorConfig';
import { EColor } from '../../enums/EColor';
import { LevelData3D } from '../../configData/LevelData3D';
import {
    GridMeshBuilder,
    GridMeshChunk,
    IBakedCubeSource,
    IMergedCube,
    bakeCubeSource,
} from './GridMeshBuilder';

const { ccclass, property } = _decorator;

/** One cube to place, in grid coordinates plus the cell position to draw it at. */
export interface ICubePlacement
{
    x: number;
    y: number;
    z: number;
    colorID: number;
    localPos: Vec3;
}

/** The 6 axis-aligned neighbour offsets that can enclose a cube. */
const NEIGHBOUR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
];

/**
 * Renders a whole 3D cube grid as a set of dynamic meshes, one per chunk of cubes.
 *
 * Each chunk owns its own child Node + MeshRenderer + Mesh, so a removal only rebuilds the
 * chunks it actually touched (the removed cube's, plus the chunk of any neighbour it exposed)
 * instead of re-uploading the entire grid. Placements are sorted into spatial blocks first, so
 * a cube and its 6 neighbours almost always land in the same chunk and a removal usually costs
 * exactly one chunk upload. The cost of the split is one draw call per chunk - see the
 * cubesPerChunk property for the trade-off.
 *
 * A chunk's mesh is recreated rather than patched in place, because updating only the index
 * range of a live submesh is not reliably picked up by the renderer on every engine/platform
 * combination. That makes cleanup mandatory: _uploadChunk() destroys the Mesh it replaces, and
 * clear() destroys every chunk mesh and node, so nothing leaks across levels.
 *
 * A cube whose 6 axis-aligned neighbours all exist and are all still present is fully enclosed
 * and never contributes a visible fragment, so it is skipped: its vertices are written but it
 * gets no slot in its chunk's index range. Removing a cube can expose the (up to 6) neighbours
 * around it, so removeBlock() re-checks exactly those and gives any newly exposed one a slot.
 * Visibility therefore only ever changes as a consequence of build()/removeBlock() - nothing
 * camera- or time-driven - so both patch the index buffers synchronously and there is no
 * lateUpdate()/per-frame rebuild here, deliberately.
 *
 * Vertex data (position/normal/color/a_capLocal) is written once per cube in build() and never
 * touched again; build() and removeBlock() only ever rewrite indices.
 */
@ccclass('GridMeshGrid3D')
export class GridMeshGrid3D extends Component
{
    @property({ type: Mesh, group: 'Source', tooltip: 'Cube body mesh, e.g. Cube3.fbx.' })
    public sourceMesh: Mesh = null;

    @property({ type: CCInteger, group: 'Source', tooltip: 'Submesh of sourceMesh to use.' })
    public sourcePrimitiveIndex: number = 0;

    @property({ type: Material, group: 'Source', tooltip: 'Material using cubeColorMerged.effect or ToonyProMerged.effect (both read the non-instanced a_color/a_colorShadow/a_capLocal streams this component writes). Create one in-editor before this will render anything.' })
    public material: Material = null;

    @property({ type: ColorConfig, group: 'Source' })
    public colorData: ColorConfig = null;

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Scale baked into the vertices. Identity by default to match PixelBlock-Bee.prefab (a flat node with no Render child scale) - raise this only if sourceMesh needs the CubeRoot/Render un-stretch baked in, e.g. CubeNew.fbx.' })
    public cubeScale: Vec3 = new Vec3(1, 1, 1);

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Euler rotation baked into the vertices. Identity by default - see cubeScale.' })
    public cubeRotationEuler: Vec3 = new Vec3(0, 0, 0);

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Extra offset applied to every cube.' })
    public cubePivotOffset: Vec3 = new Vec3(0, 0, 0);

    @property({ type: CCInteger, min: 1, group: 'Chunking', tooltip: 'Cubes per mesh chunk. Each chunk is one child MeshRenderer with its own mesh, and removing a cube only re-uploads the chunk(s) it touched - so smaller chunks mean cheaper removals but more draw calls. Clamped to whatever a uint16 index buffer can address for this source mesh. 512 suits the usual few-thousand-cube level.' })
    public cubesPerChunk: number = 512;

    private _source: IBakedCubeSource = null;
    private _builder: GridMeshBuilder = null;

    /** One child node / renderer / mesh per chunk, all index-aligned with _builder.chunks. */
    private _chunkNodes: Node[] = [];
    private _chunkRenderers: MeshRenderer[] = [];
    private _chunkMeshes: Mesh[] = [];

    /** LevelData3D.gridKey(x, y, z) -> cube ordinal. */
    private _ordinalByKey: Map<string, number> = new Map<string, number>();
    private _removed: Uint8Array = null;
    /** Slot this cube occupies in its chunk's packed index range, or -1 when it is not drawn. */
    private _slotOfCube: Int32Array = null;
    /** chunkIndex * cubesPerChunk + slot -> cube ordinal. */
    private _cubeOfSlot: Int32Array = null;
    /** Grid coordinate of every cube, 3 entries per ordinal, for neighbour lookups. */
    private _coords: Int32Array = null;

    private _cubeCount = 0;

    /**
     * Combines every cube in `cubes` into one dynamic mesh per chunk of cubesPerChunk cubes,
     * each under its own child MeshRenderer. Cubes enclosed by all 6 neighbours are written but
     * not drawn; every other cube is drawn until removeBlock() removes it.
     * Callers must not pass duplicate (x, y, z) entries; the last one wins the coordinate but
     * the earlier one's vertex data stays permanently drawn in a dead slot.
     * `cubes` is not mutated - build() sorts a copy of it for chunk locality.
     */
    public build (cubes: ICubePlacement[]): boolean
    {
        this.clear();

        if (!this.sourceMesh || !this.material)
        {
            console.error('[GridMeshGrid3D] sourceMesh and material must both be assigned.');
            return false;
        }

        this._source = bakeCubeSource(
            this.sourceMesh,
            this.sourcePrimitiveIndex,
            this.cubeScale,
            this.cubeRotationEuler
        );

        if (!this._source)
        {
            console.error('[GridMeshGrid3D] Could not read the source mesh. Check that the .fbx is not imported with "release data" enabled, and that the submesh index is valid.');
            return false;
        }

        this._cubeCount = cubes.length;
        if (this._cubeCount === 0)
        {
            console.warn('[GridMeshGrid3D] build() called with an empty cube list; nothing to draw.');
            return false;
        }

        this._builder = new GridMeshBuilder(this._source, this._cubeCount, this.cubesPerChunk);

        this._removed = new Uint8Array(this._cubeCount);
        this._slotOfCube = new Int32Array(this._cubeCount).fill(-1);
        this._cubeOfSlot = new Int32Array(this._builder.chunks.length * this._builder.cubesPerChunk).fill(-1);
        this._coords = new Int32Array(this._cubeCount * 3);

        this._writeVertices(GridMeshGrid3D.sortForChunkLocality(cubes, this._builder.cubesPerChunk));
        this._assignSlots();

        return this._createChunkMeshes();
    }

    /**
     * Removes the cube at (x, y, z) immediately: drops it from the draw set (a no-op if it was
     * enclosed and therefore never drawn), draws any of its 6 neighbours the removal exposed,
     * and re-uploads only the chunks those cubes live in. Returns false if the coordinate was
     * never built, or was already removed (double-removal is a no-op, not an error).
     */
    public removeBlock (x: number, y: number, z: number): boolean
    {
        if (!this._builder || this._chunkMeshes.length === 0 || !this._removed || !this._slotOfCube || !this._cubeOfSlot)
        {
            console.warn('[GridMeshGrid3D] removeBlock() called before build().');
            return false;
        }

        const key = LevelData3D.gridKey(x, y, z);
        const ordinal = this._ordinalByKey.get(key);

        if (ordinal === undefined)
        {
            console.warn(`[GridMeshGrid3D] No cube exists at ${key}.`);
            return false;
        }

        if (this._removed[ordinal])
        {
            return false;
        }

        this._removed[ordinal] = 1;
        this._hideCube(ordinal);
        this._revealNeighboursOf(ordinal);

        // _hideCube/_revealNeighboursOf flagged the chunks whose index ranges changed; every
        // other chunk keeps the mesh it already has on the GPU.
        this._uploadDirtyChunks();

        return true;
    }

    /** True only when the cube is actually being drawn - an enclosed cube reports false. */
    public isCubeVisible (x: number, y: number, z: number): boolean
    {
        const ordinal = this._ordinalByKey.get(LevelData3D.gridKey(x, y, z));
        return ordinal !== undefined && this._slotOfCube[ordinal] >= 0;
    }

    /** True while the cube still occupies its cell, whether or not it is drawn. */
    public isCubePresent (x: number, y: number, z: number): boolean
    {
        const ordinal = this._ordinalByKey.get(LevelData3D.gridKey(x, y, z));
        return ordinal !== undefined && this._removed[ordinal] === 0;
    }

    /** Cubes in the grid, cubes actually being drawn, chunk (= draw call) count and triangles. */
    public getStats (): { cubes: number; drawn: number; chunks: number; triangles: number }
    {
        let drawn = 0;
        if (this._builder)
        {
            for (const chunk of this._builder.chunks) drawn += chunk.liveCount;
        }

        return {
            cubes: this._cubeCount,
            drawn,
            chunks: this._builder ? this._builder.chunks.length : 0,
            triangles: this._source ? (drawn * this._source.indexCount) / 3 : 0,
        };
    }

    /**
     * Switches the whole cube map's rendering on or off without touching the chunk meshes, so it
     * can be turned back on for the next level. Every chunk lives on its own child node, so a
     * caller cannot just reach for a MeshRenderer on this component's node any more.
     */
    public setRenderersEnabled (enabled: boolean): void
    {
        for (const renderer of this._chunkRenderers)
        {
            if (renderer && renderer.isValid) renderer.enabled = enabled;
        }
    }

    public clear (): void
    {
        // Drop the mesh reference before destroying the mesh: a renderer left pointing at a
        // destroyed Mesh would keep submitting its (now released) buffers.
        for (const renderer of this._chunkRenderers)
        {
            if (renderer && renderer.isValid) renderer.mesh = null;
        }
        this._chunkRenderers.length = 0;

        for (const mesh of this._chunkMeshes)
        {
            mesh?.destroy();
        }
        this._chunkMeshes.length = 0;

        for (const node of this._chunkNodes)
        {
            if (node && node.isValid) node.destroy();
        }
        this._chunkNodes.length = 0;

        this._ordinalByKey.clear();
        this._source = null;
        this._builder = null;
        this._slotOfCube = null;
        this._cubeOfSlot = null;
        this._removed = null;
        this._coords = null;
        this._cubeCount = 0;
    }

    protected onDestroy (): void
    {
        this.clear();
    }

    /**
     * Writes every cube's vertex data - enclosed cubes included, so that a later removeBlock()
     * can reveal them by writing indices alone - and registers their coordinates.
     */
    private _writeVertices (cubes: ICubePlacement[]): void
    {
        const white = new Color(255, 255, 255, 255);
        const black = new Color(0, 0, 0, 255);
        const placement: IMergedCube = {
            x: 0, y: 0, z: 0,
            localPos: new Vec3(),
            color: white,
            shadow: black,
        };

        for (let ordinal = 0; ordinal < cubes.length; ordinal++)
        {
            const cube = cubes[ordinal];
            const key = LevelData3D.gridKey(cube.x, cube.y, cube.z);
            this._ordinalByKey.set(key, ordinal);

            this._coords[ordinal * 3] = cube.x;
            this._coords[ordinal * 3 + 1] = cube.y;
            this._coords[ordinal * 3 + 2] = cube.z;

            const tones = this.colorData ? this.colorData.getBlockColors(cube.colorID as EColor) : null;
            placement.x = cube.x;
            placement.y = cube.y;
            placement.z = cube.z;
            Vec3.add(placement.localPos, cube.localPos, this.cubePivotOffset);
            placement.color = tones ? tones.color : white;
            placement.shadow = tones ? tones.shadow : black;

            this._builder.writeCube(ordinal, placement);
        }
    }

    /** Gives a slot to every cube that is not fully enclosed by its 6 neighbours. */
    private _assignSlots (): void
    {
        for (let ordinal = 0; ordinal < this._cubeCount; ordinal++)
        {
            if (this._isEnclosed(ordinal)) continue;

            this._showCube(ordinal);
        }
    }

    /** True when all 6 axis-aligned neighbours exist and none of them has been removed. */
    private _isEnclosed (ordinal: number): boolean
    {
        const x = this._coords[ordinal * 3];
        const y = this._coords[ordinal * 3 + 1];
        const z = this._coords[ordinal * 3 + 2];

        for (const offset of NEIGHBOUR_OFFSETS)
        {
            const neighbour = this._ordinalByKey.get(
                LevelData3D.gridKey(x + offset[0], y + offset[1], z + offset[2])
            );

            if (neighbour === undefined || this._removed[neighbour]) return false;
        }

        return true;
    }

    /** Draws any neighbour of `ordinal` that its removal just exposed. */
    private _revealNeighboursOf (ordinal: number): void
    {
        const x = this._coords[ordinal * 3];
        const y = this._coords[ordinal * 3 + 1];
        const z = this._coords[ordinal * 3 + 2];

        for (const offset of NEIGHBOUR_OFFSETS)
        {
            const neighbour = this._ordinalByKey.get(
                LevelData3D.gridKey(x + offset[0], y + offset[1], z + offset[2])
            );

            if (neighbour === undefined) continue;
            if (this._removed[neighbour] || this._slotOfCube[neighbour] >= 0) continue;

            this._showCube(neighbour);
        }
    }

    /** Appends a cube to the end of its chunk's packed draw range. */
    private _showCube (ordinal: number): void
    {
        if (this._slotOfCube[ordinal] >= 0) return;

        const cubesPerChunk = this._builder.cubesPerChunk;
        const chunkIndex = Math.floor(ordinal / cubesPerChunk);
        const chunk = this._builder.chunks[chunkIndex];
        const localOrdinal = ordinal % cubesPerChunk;
        const slot = chunk.liveCount;

        this._builder.writeIndices(chunk, localOrdinal, slot);
        this._cubeOfSlot[chunkIndex * cubesPerChunk + slot] = ordinal;
        this._slotOfCube[ordinal] = slot;
        chunk.liveCount = slot + 1;
        chunk.dirty = true;
    }

    /**
     * Frees a slot by moving the last live cube into it, keeping the draw range contiguous.
     * A no-op for a cube that was never drawn (an enclosed one). The swapped-in cube always
     * comes from the same chunk, so only that one chunk is dirtied. The caller re-uploads.
     */
    private _hideCube (ordinal: number): void
    {
        const slot = this._slotOfCube[ordinal];
        if (slot < 0) return;

        const cubesPerChunk = this._builder.cubesPerChunk;
        const chunkIndex = Math.floor(ordinal / cubesPerChunk);
        const chunk = this._builder.chunks[chunkIndex];
        const slotBase = chunkIndex * cubesPerChunk;
        const lastSlot = chunk.liveCount - 1;

        if (lastSlot < 0)
        {
            return;
        }

        if (slot !== lastSlot)
        {
            const moved = this._cubeOfSlot[slotBase + lastSlot];

            if (moved < 0)
            {
                console.error('[GridMeshGrid3D] Invalid packed-slot state while removing cube.', {
                    ordinal,
                    slot,
                    lastSlot,
                    chunkIndex,
                });
                return;
            }

            const movedLocalOrdinal = moved % cubesPerChunk;
            this._builder.writeIndices(chunk, movedLocalOrdinal, slot);
            this._cubeOfSlot[slotBase + slot] = moved;
            this._slotOfCube[moved] = slot;
        }

        this._cubeOfSlot[slotBase + lastSlot] = -1;
        this._slotOfCube[ordinal] = -1;
        chunk.liveCount = lastSlot;
        chunk.dirty = true;
    }

    /**
     * Spawns one child node + MeshRenderer per chunk and uploads each chunk's geometry.
     *
     * The children sit at the component node's origin with no local transform, so every cube's
     * baked local position still means the same thing it did as a single merged mesh.
     */
    private _createChunkMeshes (): boolean
    {
        const chunks = this._builder ? this._builder.chunks : [];
        if (chunks.length === 0) return false;

        // A single MeshRenderer on this node is what earlier builds of this component drew
        // through. The chunk children own the drawing now, so leave it holding nothing.
        const legacyRenderer = this.getComponent(MeshRenderer);
        if (legacyRenderer)
        {
            legacyRenderer.mesh = null;
            legacyRenderer.enabled = false;
        }

        for (const chunk of chunks)
        {
            const node = new Node(`CubeChunk_${chunk.index}`);
            node.layer = this.node.layer;
            node.setParent(this.node);
            node.setPosition(0, 0, 0);

            const renderer = node.addComponent(MeshRenderer);
            renderer.setMaterial(this.material, 0);

            this._chunkNodes.push(node);
            this._chunkRenderers.push(renderer);
            this._chunkMeshes.push(null);

            chunk.dirty = true;
        }

        return this._uploadDirtyChunks();
    }

    /** Re-uploads every chunk flagged dirty, and clears the flag. Untouched chunks are skipped. */
    private _uploadDirtyChunks (): boolean
    {
        const chunks = this._builder ? this._builder.chunks : [];
        let ok = true;

        for (const chunk of chunks)
        {
            if (!chunk.dirty) continue;

            chunk.dirty = false;
            if (!this._uploadChunk(chunk)) ok = false;
        }

        return ok;
    }

    /**
     * Rebuilds one chunk's Cocos dynamic mesh from the builder's cached vertex/index arrays and
     * hands it to that chunk's renderer.
     *
     * The mesh is recreated rather than patched through Mesh.updateSubMesh(): changing only the
     * index range of a live submesh is not reflected by the renderer on every engine/platform
     * combination, and a wrong draw range shows up as stray or missing cubes. Recreating costs
     * one Mesh allocation per changed chunk - which is exactly why the grid is chunked, so a
     * removal pays that for one chunk instead of the whole level - and it makes destroying the
     * mesh it replaces mandatory, since nothing else releases those GPU buffers.
     */
    private _uploadChunk (chunk: GridMeshChunk): boolean
    {
        const index = chunk.index;
        const renderer = this._chunkRenderers[index];
        if (!renderer || !renderer.isValid) return false;

        // Every cube in the chunk is gone or enclosed: there is nothing to draw, so drop the mesh
        // instead of building one with an empty index range.
        if (chunk.liveCount === 0)
        {
            renderer.mesh = null;
            this._chunkMeshes[index]?.destroy();
            this._chunkMeshes[index] = null;
            return true;
        }

        const newMesh = utils.MeshUtils.createDynamicMesh(
            0,
            this._builder.buildGeometry(chunk),
            undefined,
            {
                maxSubMeshes: 1,
                maxSubMeshVertices: this._builder.chunkMaxVertices(chunk),
                maxSubMeshIndices: this._builder.chunkMaxIndices(chunk),
            }
        );

        if (!newMesh)
        {
            console.error(`[GridMeshGrid3D] Failed to build the mesh for chunk ${index}.`);
            return false;
        }

        const oldMesh = this._chunkMeshes[index];

        renderer.mesh = newMesh;
        renderer.setMaterial(this.material, 0);
        this._chunkMeshes[index] = newMesh;

        // Only after the renderer has let go of it: destroying a Mesh releases its GPU buffers,
        // and a renderer still pointing at those would draw from freed memory.
        if (oldMesh && oldMesh !== newMesh)
        {
            oldMesh.destroy();
        }

        return true;
    }

    /**
     * Orders cubes so that grid neighbours end up in the same chunk.
     *
     * Chunks are cut from fill order, so the input order decides what shares a chunk. Sorting by
     * cube-sized blocks first (rather than plain y/z/x, which would put the cube one row up in a
     * far-away chunk) keeps a cube and its 6 neighbours together, which is what makes a removal
     * usually dirty one chunk instead of up to seven. Returns a new array; the caller's is
     * untouched.
     */
    private static sortForChunkLocality (cubes: ICubePlacement[], cubesPerChunk: number): ICubePlacement[]
    {
        // Cube-root of the chunk size, so one full block is roughly one chunk's worth of cubes.
        const blockSize = Math.max(1, Math.floor(Math.cbrt(cubesPerChunk)));
        const blockOf = (v: number): number => Math.floor(v / blockSize);

        return cubes.slice().sort((a, b) =>
            (blockOf(a.y) - blockOf(b.y))
            || (blockOf(a.z) - blockOf(b.z))
            || (blockOf(a.x) - blockOf(b.x))
            || (a.y - b.y)
            || (a.z - b.z)
            || (a.x - b.x)
        );
    }
}
