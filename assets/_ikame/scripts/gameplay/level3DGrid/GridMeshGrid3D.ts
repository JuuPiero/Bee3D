import { _decorator, CCInteger, Color, Component, Material, Mesh, MeshRenderer, Vec3, utils } from 'cc';
import { ColorConfig } from '../../configData/ColorConfig';
import { EColor } from '../../enums/EColor';
import { LevelData3D } from '../../configData/LevelData3D';
import {
    GridMeshBuilder,
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

/**
 * Renders a whole 3D cube grid as a single dynamic mesh under one MeshRenderer.
 *
 * Unlike GridMapMesh3D (which this supersedes - that class is left on disk for reference only,
 * do not extend it), there is no topological enclosure culling: every cube passed to build()
 * is drawn until removeBlock() is called for its coordinate. Since a cube's visibility is
 * therefore only ever changed by an explicit removeBlock() call and nothing else (no camera,
 * no neighbour state, no time), removeBlock() patches and re-uploads just its own chunk's index
 * buffer synchronously - there is no lateUpdate()/per-frame rebuild here, deliberately.
 *
 * Vertex data (position/normal/color/a_capLocal) is written once per cube in build() and never
 * touched again; removeBlock() only ever rewrites indices.
 */
@ccclass('GridMeshGrid3D')
export class GridMeshGrid3D extends Component
{
    @property({ type: Mesh, group: 'Source', tooltip: 'Cube body mesh, e.g. Cube3.fbx.' })
    public sourceMesh: Mesh = null;

    @property({ type: CCInteger, group: 'Source', tooltip: 'Submesh of sourceMesh to use.' })
    public sourcePrimitiveIndex: number = 0;

    @property({ type: Material, group: 'Source', tooltip: 'Material using cubeColorMerged.effect (non-instanced a_color/a_colorShadow/a_capLocal). No such material asset exists yet - create one in-editor before this will render anything.' })
    public material: Material = null;

    @property({ type: ColorConfig, group: 'Source' })
    public colorData: ColorConfig = null;

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Scale baked into the vertices. Identity by default to match PixelBlock-Bee.prefab (a flat node with no Render child scale) - raise this only if sourceMesh needs the CubeRoot/Render un-stretch baked in, e.g. CubeNew.fbx.' })
    public cubeScale: Vec3 = new Vec3(1, 1, 1);

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Euler rotation baked into the vertices. Identity by default - see cubeScale.' })
    public cubeRotationEuler: Vec3 = new Vec3(0, 0, 0);

    @property({ type: Vec3, group: 'Cube Transform', tooltip: 'Extra offset applied to every cube.' })
    public cubePivotOffset: Vec3 = new Vec3(0, 0, 0);

    private _renderer: MeshRenderer = null;
    private _source: IBakedCubeSource = null;
    private _builder: GridMeshBuilder = null;
    private _mesh: Mesh = null;

    /** LevelData3D.gridKey(x, y, z) -> cube ordinal. */
    private _ordinalByKey: Map<string, number> = new Map<string, number>();
    private _removed: Uint8Array = null;
    /** Slot this cube occupies in its chunk's packed index range, or -1 once removed. */
    private _slotOfCube: Int32Array = null;
    /** chunkIndex * cubesPerChunk + slot -> cube ordinal. */
    private _cubeOfSlot: Int32Array = null;

    private _cubeCount = 0;

    /**
     * Combines every cube in `cubes` into one dynamic mesh, one MeshRenderer, N chunks. Every
     * cube is drawn immediately - there is no enclosure test - until removeBlock() removes it.
     * Callers must not pass duplicate (x, y, z) entries; the last one wins the coordinate but
     * the earlier one's vertex data stays permanently drawn in a dead slot.
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

        this._builder = new GridMeshBuilder(this._source, this._cubeCount);

        this._removed = new Uint8Array(this._cubeCount);
        this._slotOfCube = new Int32Array(this._cubeCount);
        this._cubeOfSlot = new Int32Array(this._builder.chunks.length * this._builder.cubesPerChunk).fill(-1);

        this._writeVerticesAndAssignSlots(cubes);

        return this._createMesh();
    }

    /**
     * Removes the cube at (x, y, z) from the draw set immediately: patches and re-uploads only
     * its own chunk's index buffer. Returns false if the coordinate was never built, or was
     * already removed (double-removal is a no-op, not an error).
     */
    public removeBlock (x: number, y: number, z: number): boolean
    {
        if (!this._builder || !this._mesh || !this._removed || !this._slotOfCube || !this._cubeOfSlot)
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

        this._hideCube(ordinal);
        this._removed[ordinal] = 1;

        return true;
    }

    public isCubeVisible (x: number, y: number, z: number): boolean
    {
        const ordinal = this._ordinalByKey.get(LevelData3D.gridKey(x, y, z));
        return ordinal !== undefined && this._slotOfCube[ordinal] >= 0;
    }

    /** Cubes in the grid, cubes actually being drawn, chunk count and triangle count. */
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
        this._slotOfCube = null;
        this._cubeOfSlot = null;
        this._removed = null;
        this._cubeCount = 0;
    }

    protected onDestroy (): void
    {
        this.clear();
    }

    /**
     * Writes every cube's vertex data and, since nothing starts hidden, gives every cube a
     * slot in the same pass - slot == local ordinal for every cube at build time.
     */
    private _writeVerticesAndAssignSlots (cubes: ICubePlacement[]): void
    {
        const cubesPerChunk = this._builder.cubesPerChunk;
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

            const tones = this.colorData ? this.colorData.getBlockColors(cube.colorID as EColor) : null;
            placement.x = cube.x;
            placement.y = cube.y;
            placement.z = cube.z;
            Vec3.add(placement.localPos, cube.localPos, this.cubePivotOffset);
            placement.color = tones ? tones.color : white;
            placement.shadow = tones ? tones.shadow : black;

            this._builder.writeCube(ordinal, placement);

            const chunkIndex = Math.floor(ordinal / cubesPerChunk);
            const chunk = this._builder.chunks[chunkIndex];
            const localOrdinal = ordinal % cubesPerChunk;
            const slotBase = chunkIndex * cubesPerChunk;

            this._builder.writeIndices(chunk, localOrdinal, localOrdinal);
            this._cubeOfSlot[slotBase + localOrdinal] = ordinal;
            this._slotOfCube[ordinal] = localOrdinal;
            chunk.liveCount = localOrdinal + 1;
        }
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

        // Recreate the dynamic mesh so Cocos sees the new draw ranges immediately.
        // This is deliberately more conservative than an index-only updateSubMesh call.
        this._rebuildMesh();
    }

    private _createMesh (): boolean
    {
        return this._rebuildMesh();
    }

    /**
     * Recreates the Cocos dynamic mesh from the builder's current chunk data.
     *
     * Vertex arrays remain cached in GridMeshBuilder; only the Mesh GPU object is recreated.
     * This makes removals deterministic even on engine/platform combinations where changing
     * only the index range of an existing submesh is not reflected by the renderer immediately.
     */
    private _rebuildMesh (): boolean
    {
        if (!this._builder || this._builder.chunks.length === 0)
        {
            return false;
        }

        const chunks = this._builder.chunks;
        const oldMesh = this._mesh;

        const newMesh = utils.MeshUtils.createDynamicMesh(
            0,
            this._builder.buildGeometry(chunks[0]),
            undefined,
            {
                maxSubMeshes: chunks.length,
                maxSubMeshVertices: this._builder.maxSubMeshVertices,
                maxSubMeshIndices: this._builder.maxSubMeshIndices,
            }
        );

        if (!newMesh)
        {
            console.error('[GridMeshGrid3D] Failed to rebuild dynamic mesh.');
            return false;
        }

        for (let i = 1; i < chunks.length; i++)
        {
            newMesh.updateSubMesh(i, this._builder.buildGeometry(chunks[i]));
        }

        this._renderer = this.getComponent(MeshRenderer) || this.addComponent(MeshRenderer);
        this._renderer.mesh = newMesh;

        for (let i = 0; i < chunks.length; i++)
        {
            this._renderer.setMaterial(this.material, i);
        }

        this._mesh = newMesh;

        if (oldMesh && oldMesh !== newMesh)
        {
            oldMesh.destroy();
        }

        return true;
    }
}
