import { _decorator, CCInteger, Color, Component, Material, Mesh, MeshRenderer, Vec3, utils } from 'cc';
import { ColorConfig } from '../../configData/ColorConfig';
import { EColor } from '../../enums/EColor';
import {
    GridMeshBuilder,
    IBakedCubeSource,
    IMergedCube,
    bakeCubeSource,
    buildIndexOnlyGeometry,
} from './GridMeshBuilder';

const { ccclass, property } = _decorator;

/** One cube to place, in grid coordinates plus the cell position LevelGrid3D computed. */
export interface ICubePlacement
{
    x: number;
    y: number;
    z: number;
    colorID: number;
    localPos: Vec3;
}

/** Neighbour offsets used for the enclosed-cube test. */
const NEIGHBOUR_OFFSETS: readonly number[][] = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
];

/**
 * Renders the whole 3D cube grid as a single dynamic mesh under one MeshRenderer, replacing
 * the one-node-per-cube prefab path in LevelGrid3D.
 *
 * Two things make this cheap:
 *
 * - Vertex data is written once for every cube in the level and never touched again. Showing
 *   or hiding a cube only rewrites indices, and updateSubMesh skips vertex streams whose
 *   arrays are empty, so a visibility change uploads the index buffer alone.
 * - A cube whose six neighbours are all occupied cannot be seen, so it never gets a slot in
 *   the index buffer. Removing a cube re-checks its neighbours and reveals the ones that
 *   just became exposed.
 *
 * Per-cube animation is not supported by design; that is what buys the node-count saving.
 */
@ccclass('GridMapMesh3D')
export class GridMapMesh3D extends Component
{
    @property({ type: Mesh, group: 'Source', tooltip: 'Cube body mesh, e.g. CubeNew.fbx > Cube.' })
    public sourceMesh: Mesh = null;

    @property({ type: CCInteger, group: 'Source', tooltip: 'Submesh of sourceMesh to use. 0 is the cube body; on CubeNew.fbx submesh 1 is the flat ground drop-shadow decal, which a 3D grid does not want.' })
    public sourcePrimitiveIndex: number = 0;

    @property({ type: Material, group: 'Source', tooltip: 'Material using cubeColorMerged.effect.' })
    public material: Material = null;

    @property({ type: ColorConfig, group: 'Source' })
    public colorData: ColorConfig = null;

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Scale of the prefab Render node. Baked into the vertices, so cubeColorMerged.effect does not have to un-stretch anything.' })
    public cubeScale: Vec3 = new Vec3(1.107, 1.835, 1.107);

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Euler rotation of the prefab CubeRoot node, baked per cube. Defaults to the prefab value so the merged path can be compared against it directly.' })
    public cubeRotationEuler: Vec3 = new Vec3(6.3, 180, 0);

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Extra offset applied to every cube. The source mesh has its pivot at the base (y spans 0..1), so -0.5 * cubeScale.y re-centres it in the cell.' })
    public cubePivotOffset: Vec3 = new Vec3(0, 0, 0);

    private _renderer: MeshRenderer = null;
    private _source: IBakedCubeSource = null;
    private _builder: GridMeshBuilder = null;
    private _mesh: Mesh = null;

    /** Numeric grid key -> cube ordinal. */
    private _ordinalByKey: Map<number, number> = new Map<number, number>();
    private _cubeX: Int32Array = null;
    private _cubeY: Int32Array = null;
    private _cubeZ: Int32Array = null;
    private _removed: Uint8Array = null;
    /** Slot this cube occupies in its chunk's packed index range, or -1 when not drawn. */
    private _slotOfCube: Int32Array = null;
    /** chunkIndex * cubesPerChunk + slot -> cube ordinal. */
    private _cubeOfSlot: Int32Array = null;

    private _cubeCount = 0;
    private _keyStrideY = 1;
    private _keyStrideX = 1;
    private _hasDirtyChunk = false;

    public build (cubes: ICubePlacement[], gridSize: Vec3): boolean
    {
        this.clear();

        if (!this.sourceMesh || !this.material)
        {
            console.error('[GridMapMesh3D] sourceMesh and material must both be assigned.');
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
            console.error('[GridMapMesh3D] Could not read the source mesh. Check that the .fbx is not imported with "release data" enabled, and that the submesh index is valid.');
            return false;
        }

        this._cubeCount = cubes.length;
        if (this._cubeCount === 0)
        {
            return false;
        }

        this._keyStrideY = Math.max(1, Math.floor(gridSize.z) + 2);
        this._keyStrideX = this._keyStrideY * Math.max(1, Math.floor(gridSize.y) + 2);

        this._builder = new GridMeshBuilder(this._source, this._cubeCount);

        this._cubeX = new Int32Array(this._cubeCount);
        this._cubeY = new Int32Array(this._cubeCount);
        this._cubeZ = new Int32Array(this._cubeCount);
        this._removed = new Uint8Array(this._cubeCount);
        this._slotOfCube = new Int32Array(this._cubeCount).fill(-1);
        this._cubeOfSlot = new Int32Array(this._builder.chunks.length * this._builder.cubesPerChunk).fill(-1);

        this._writeVertices(cubes);
        this._assignInitialSlots();

        return this._createMesh();
    }

    /**
     * Hides a cube and reveals any neighbour that its removal just exposed. The GPU upload
     * is deferred to the end of the frame, so removing many cubes at once costs one upload
     * per affected chunk rather than one per cube.
     */
    public removeCube (x: number, y: number, z: number): boolean
    {
        const ordinal = this._ordinalByKey.get(this._key(x, y, z));
        if (ordinal === undefined || this._removed[ordinal]) return false;

        this._removed[ordinal] = 1;
        this._hideCube(ordinal);

        for (const offset of NEIGHBOUR_OFFSETS)
        {
            const neighbour = this._ordinalByKey.get(this._key(x + offset[0], y + offset[1], z + offset[2]));
            if (neighbour === undefined || this._removed[neighbour]) continue;
            if (this._slotOfCube[neighbour] >= 0) continue;
            this._showCube(neighbour);
        }

        return true;
    }

    /**
     * Removes one arbitrary cube that is currently being drawn. Only exists to exercise
     * removeCube() without a picking implementation; a real game removes by coordinate.
     */
    public removeRandomVisibleCube (): boolean
    {
        if (!this._builder || this._cubeCount === 0) return false;

        const visible: number[] = [];
        for (let ordinal = 0; ordinal < this._cubeCount; ordinal++)
        {
            if (this._slotOfCube[ordinal] >= 0) visible.push(ordinal);
        }

        if (visible.length === 0) return false;

        const ordinal = visible[Math.floor(Math.random() * visible.length)];
        return this.removeCube(this._cubeX[ordinal], this._cubeY[ordinal], this._cubeZ[ordinal]);
    }

    /**
     * Temporarily hides/shows a cube for camera-based occlusion culling, independent of
     * removeCube's permanent gameplay removal. No-op if the cube was already removed, or
     * if trying to reveal a cube that is topologically enclosed - it can never be visible
     * regardless of camera angle, so it stays out of the index buffer either way.
     */
    public setCubeOccluded (x: number, y: number, z: number, occluded: boolean): void
    {
        const ordinal = this._ordinalByKey.get(this._key(x, y, z));
        if (ordinal === undefined || this._removed[ordinal]) return;

        if (occluded)
        {
            this._hideCube(ordinal);
        }
        else if (!this._isEnclosed(ordinal))
        {
            this._showCube(ordinal);
        }
    }

    public isCubeVisible (x: number, y: number, z: number): boolean
    {
        const ordinal = this._ordinalByKey.get(this._key(x, y, z));
        return ordinal !== undefined && this._slotOfCube[ordinal] >= 0;
    }

    /** Cubes in the level, cubes actually being drawn, chunk count and triangle count. */
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

    public clear (): void
    {
        if (this._renderer)
        {
            this._renderer.mesh = null;
        }

        if (this._mesh)
        {
            this._mesh.destroy();
            this._mesh = null;
        }

        this._ordinalByKey.clear();
        this._source = null;
        this._builder = null;
        this._cubeX = this._cubeY = this._cubeZ = null;
        this._slotOfCube = this._cubeOfSlot = null;
        this._removed = null;
        this._cubeCount = 0;
        this._hasDirtyChunk = false;
    }

    protected lateUpdate (): void
    {
        if (!this._hasDirtyChunk || !this._mesh || !this._builder) return;

        const chunks = this._builder.chunks;
        for (let i = 0; i < chunks.length; i++)
        {
            if (!chunks[i].dirty) continue;
            this._mesh.updateSubMesh(i, buildIndexOnlyGeometry(chunks[i], this._builder.indicesPerCube));
            chunks[i].dirty = false;
        }

        this._hasDirtyChunk = false;
    }

    protected onDestroy (): void
    {
        this.clear();
    }

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

            this._cubeX[ordinal] = cube.x;
            this._cubeY[ordinal] = cube.y;
            this._cubeZ[ordinal] = cube.z;
            this._ordinalByKey.set(this._key(cube.x, cube.y, cube.z), ordinal);

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

    /** Draws every cube that has at least one empty neighbour; the rest are sealed inside. */
    private _assignInitialSlots (): void
    {
        for (let ordinal = 0; ordinal < this._cubeCount; ordinal++)
        {
            if (this._isEnclosed(ordinal)) continue;
            this._showCube(ordinal);
        }

        // The initial fill is the mesh's creation geometry, not an incremental edit.
        for (const chunk of this._builder.chunks) chunk.dirty = false;
        this._hasDirtyChunk = false;
    }

    private _isEnclosed (ordinal: number): boolean
    {
        const x = this._cubeX[ordinal];
        const y = this._cubeY[ordinal];
        const z = this._cubeZ[ordinal];

        for (const offset of NEIGHBOUR_OFFSETS)
        {
            const neighbour = this._ordinalByKey.get(this._key(x + offset[0], y + offset[1], z + offset[2]));
            if (neighbour === undefined || this._removed[neighbour]) return false;
        }

        return true;
    }

    private _showCube (ordinal: number): void
    {
        if (this._slotOfCube[ordinal] >= 0) return;

        const cubesPerChunk = this._builder.cubesPerChunk;
        const chunkIndex = Math.floor(ordinal / cubesPerChunk);
        const chunk = this._builder.chunks[chunkIndex];
        const slot = chunk.liveCount;

        this._builder.writeIndices(chunk, ordinal % cubesPerChunk, slot);
        this._cubeOfSlot[chunkIndex * cubesPerChunk + slot] = ordinal;
        this._slotOfCube[ordinal] = slot;
        chunk.liveCount = slot + 1;
        chunk.dirty = true;
        this._hasDirtyChunk = true;
    }

    /** Frees a slot by moving the last live cube into it, keeping the draw range contiguous. */
    private _hideCube (ordinal: number): void
    {
        const slot = this._slotOfCube[ordinal];
        if (slot < 0) return;

        const cubesPerChunk = this._builder.cubesPerChunk;
        const chunkIndex = Math.floor(ordinal / cubesPerChunk);
        const chunk = this._builder.chunks[chunkIndex];
        const slotBase = chunkIndex * cubesPerChunk;
        const lastSlot = chunk.liveCount - 1;

        if (slot !== lastSlot)
        {
            const moved = this._cubeOfSlot[slotBase + lastSlot];
            this._builder.writeIndices(chunk, moved % cubesPerChunk, slot);
            this._cubeOfSlot[slotBase + slot] = moved;
            this._slotOfCube[moved] = slot;
        }

        this._cubeOfSlot[slotBase + lastSlot] = -1;
        this._slotOfCube[ordinal] = -1;
        chunk.liveCount = lastSlot;
        chunk.dirty = true;
        this._hasDirtyChunk = true;
    }

    private _createMesh (): boolean
    {
        const chunks = this._builder.chunks;

        this._mesh = utils.MeshUtils.createDynamicMesh(
            0,
            this._builder.buildGeometry(chunks[0]),
            undefined,
            {
                maxSubMeshes: chunks.length,
                maxSubMeshVertices: this._builder.maxSubMeshVertices,
                maxSubMeshIndices: this._builder.maxSubMeshIndices,
            }
        );

        for (let i = 1; i < chunks.length; i++)
        {
            this._mesh.updateSubMesh(i, this._builder.buildGeometry(chunks[i]));
        }

        this._renderer = this.getComponent(MeshRenderer) || this.addComponent(MeshRenderer);
        this._renderer.mesh = this._mesh;

        for (let i = 0; i < chunks.length; i++)
        {
            this._renderer.setMaterial(this.material, i);
        }

        return true;
    }

    private _key (x: number, y: number, z: number): number
    {
        return x * this._keyStrideX + y * this._keyStrideY + z;
    }
}
