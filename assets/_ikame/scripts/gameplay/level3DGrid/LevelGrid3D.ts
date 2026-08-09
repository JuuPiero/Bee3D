import { _decorator, Camera, CCBoolean, CCFloat, CCInteger, Color, Component, JsonAsset, Node, Quat, Vec3 } from 'cc';
import { LevelData3D } from '../../configData/LevelData3D';
import { GridTile3D } from './GridTile3D';
import { IGridTile3D } from './IGridTile3D';
import { GridMapMesh3D, ICubePlacement } from './GridMapMesh3D';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { ProjectedTriangle } from './ProjectedTriangle';
const { ccclass, property } = _decorator;

@ccclass('LevelGrid3D')
export class LevelGrid3D extends Component
{
    @property({ type: Node, group: 'Cube Map' })
    public cubeBlockHolder: Node = null;

    @property({ type: GridMapMesh3D, group: 'Cube Map' })
    public gridMapMesh: GridMapMesh3D = null;

    @property({ type: [ JsonAsset ], group: 'LevelData' })
    public levelJsonAssets: JsonAsset[] = [];

    @property({ type: CCInteger, group: 'LevelData' })
    public levelIndex: number = 0;

    @property({ type: Camera, group: 'Occlusion' })
    public camera: Camera = null;

    @property({ type: Vec3, group: 'Occlusion' })
    public occlusionBoxSize: Vec3 = new Vec3(1, 1, 1);

    @property({ type: CCInteger, group: 'Occlusion' })
    public occlusionSampleGridSize: number = 3;

    @property({ type: CCFloat, min: 0, max: 0.49, step: 0.01, group: 'Occlusion' })
    public occlusionSampleMargin: number = 0.1;

    @property({ type: CCInteger, group: 'Occlusion' })
    public visibilitySampleCountHideThreshold: number = 0;

    @property({ type: CCBoolean, group: 'Occlusion', tooltip: 'Draws a cross at each cube (green = visible, red = hidden) using the camera\'s geometry renderer.' })
    public debugDrawVisibility: boolean = false;

    @property({ type: CCFloat, min: 0.001, group: 'Occlusion' })
    public debugPointRadius: number = 0.05;

    public levelData: LevelData3D = null;

    private _gridMap = new Map<string, GridTile3D>();

    // Every tile currently holding a cube. Hiding by topology (all 6 neighbours filled) is
    // handled entirely by GridMapMesh3D itself, event-driven off removeCube() - nothing here
    // needs to poll it every frame. This list only feeds the debug visibility computation.
    private _solidTiles: GridTile3D[] = [];

    private readonly _occlusionHalfExtents = new Vec3();
    private readonly _screenProjector = new ScreenProjector();
    private readonly _holderWorldRotation = new Quat();

    // Reused every lateUpdate(): every solid tile's occlusion box projected into up to 12
    // triangles each, concatenated into one shared array. _tileTriangleStart/_tileTriangleCount
    // (index-aligned with _solidTiles) mark each tile's own slice, which computeVisibility
    // skips so a tile can never self-occlude.
    private _trianglePool: ProjectedTriangle[] = [];
    private _triangles: ProjectedTriangle[] = [];
    private _tileTriangleStart: number[] = [];
    private _tileTriangleCount: number[] = [];

    start()
    {
        this.spawnLevel();
        this.camera?.camera?.initGeometryRenderer();
    }

    public spawnLevel(): void
    {
        var textJson = JSON.stringify(this.levelJsonAssets[this.levelIndex].json);
        this.levelData = new LevelData3D(textJson);

        const gridSize = this.levelData.gridSize;

        const cubeBounds = this.computeCubeBounds(gridSize);
        const offsetX = -(cubeBounds.minX + cubeBounds.maxX) / 2;
        const offsetZ = -(cubeBounds.minZ + cubeBounds.maxZ) / 2;
        const offsetY = -(cubeBounds.minY + cubeBounds.maxY) / 2;

        for (let x = 0; x < gridSize.x; x++)
        {
            for (let y = 0; y < gridSize.y; y++)
            {
                for (let z = 0; z < gridSize.z; z++)
                {
                    const key = LevelData3D.gridKey(x, y, z);
                    const gridTile = new GridTile3D(x, y, z, this.cubeBlockHolder, new Vec3(x + offsetX, y + offsetY, z + offsetZ));
                    this._gridMap.set(key, gridTile);
                }
            }
        }

        for (const tile of this._gridMap.values())
        {
            const x = tile.getCoordX();
            const y = tile.getCoordY();
            const z = tile.getCoordZ();
            const upTile = this._gridMap.get( LevelData3D.gridKey(x, y + 1, z) ) || null;
            const downTile = this._gridMap.get( LevelData3D.gridKey(x, y - 1, z) ) || null;
            const topTile = this._gridMap.get( LevelData3D.gridKey(x, y, z - 1) ) || null;
            const bottomTile = this._gridMap.get( LevelData3D.gridKey(x, y, z + 1) ) || null;
            const leftTile = this._gridMap.get( LevelData3D.gridKey(x - 1, y, z) ) || null;
            const rightTile = this._gridMap.get( LevelData3D.gridKey(x + 1, y, z) ) || null;
            tile.setLinkedTiles(upTile, downTile, topTile, bottomTile, leftTile, rightTile);
        }

        this._occlusionHalfExtents.set(
            Math.abs(this.occlusionBoxSize.x) * 0.5,
            Math.abs(this.occlusionBoxSize.y) * 0.5,
            Math.abs(this.occlusionBoxSize.z) * 0.5,
        );
        GridTile3D.configureOcclusion(this.occlusionBoxSize, this.occlusionSampleGridSize, this.occlusionSampleMargin);

        const placements: ICubePlacement[] = [];
        let spawnedCount = 0;
        for (let i = 0; i < this.levelData.cubes.length; i++)
        {
            const cubeData = this.levelData.cubes[i];
            const key = LevelData3D.gridKey(cubeData.x, cubeData.y, cubeData.z);
            const gridTile = this._gridMap.get(key);
            if (!gridTile)
            {
                console.warn(`[LevelGrid3D] Cube at (${cubeData.x}, ${cubeData.y}, ${cubeData.z}) is outside GridSize, skipped.`);
                continue;
            }

            gridTile.setCubeData(cubeData.color, cubeData.health);

            placements.push({
                x: cubeData.x,
                y: cubeData.y,
                z: cubeData.z,
                colorID: cubeData.color,
                localPos: gridTile.getLocalPos(),
            });

            spawnedCount++;
        }

        this._solidTiles.length = 0;
        this._tileTriangleStart.length = 0;
        this._tileTriangleCount.length = 0;
        for (const tile of this._gridMap.values())
        {
            if (!tile.isContainBlock()) continue;
            this._solidTiles.push(tile);
            this._tileTriangleStart.push(0);
            this._tileTriangleCount.push(0);
        }

        if (!this.gridMapMesh)
        {
            console.error('[LevelGrid3D] gridMapMesh is not assigned.');
            return;
        }

        this.gridMapMesh.build(placements, gridSize);

        const stats = this.gridMapMesh.getStats();
        console.log(`[LevelGrid3D] Grid ${gridSize.x}x${gridSize.y}x${gridSize.z}, tiles: ${this._gridMap.size}, merged mesh: ${stats.drawn}/${stats.cubes} cubes drawn across ${stats.chunks} chunk(s), ${stats.triangles} tris (spawned ${spawnedCount}/${this.levelData.cubes.length})`);
    }

    /**
     * Removes a cube from the merged mesh. Neighbours that the removal exposes are revealed
     * automatically.
     */
    public removeCube(x: number, y: number, z: number): boolean
    {
        if (!this.gridMapMesh) return false;

        const tile = this._gridMap.get(LevelData3D.gridKey(x, y, z));
        tile?.clearCubeData();

        return this.gridMapMesh.removeCube(x, y, z);
    }

    lateUpdate(): void
    {
        if (!this.camera || this._solidTiles.length === 0) return;

        this._screenProjector.prepare(this.camera);

        // Same rotation for every tile (they all share cubeBlockHolder), so fetch it once.
        this.cubeBlockHolder.getWorldRotation(this._holderWorldRotation);

        // Step 1: project every solid tile's occlusion box once, into a shared triangle list.
        // Each tile's own [start, end) slice is recorded so its check can skip it below.
        this._triangles.length = 0;
        let poolIndex = 0;
        for (let i = 0; i < this._solidTiles.length; i++)
        {
            const start = this._triangles.length;
            poolIndex = GridTile3D.projectOcclusionTriangles(this.camera, this._screenProjector, this._solidTiles[i].getWorldPos(), this._occlusionHalfExtents, this._holderWorldRotation, this._trianglePool, poolIndex, this._triangles);
            this._tileTriangleStart[i] = start;
            this._tileTriangleCount[i] = this._triangles.length - start;
        }

        const debugRenderer = this.debugDrawVisibility ? this.camera.camera?.geometryRenderer : null;

        // Step 2: check every tile against those triangles, excluding its own slice.
        for (let i = 0; i < this._solidTiles.length; i++)
        {
            const tile = this._solidTiles[i];

            const excludeStart = this._tileTriangleStart[i];
            const excludeEnd = excludeStart + this._tileTriangleCount[i];

            const result = tile.computeVisibility(this.camera, this._screenProjector, this._triangles, excludeStart, excludeEnd);

            const isVisible = result.visibleSamples > this.visibilitySampleCountHideThreshold;

            if (debugRenderer && isVisible)
            {
                debugRenderer.addCross(tile.getWorldPos(), this.debugPointRadius,  Color.WHITE, true);
            }
        }
    }

    public clearLevel(): void
    {
        this._solidTiles.length = 0;
        this._triangles.length = 0;
        this._tileTriangleStart.length = 0;
        this._tileTriangleCount.length = 0;

        this.gridMapMesh?.clear();

        this._gridMap.clear();
    }

    public getTileAtCoord(x: number, y: number, z: number): IGridTile3D | null
    {
        return this._gridMap.get( LevelData3D.gridKey(x, y, z) ) || null;
    }


    private computeCubeBounds(gridSize: Vec3): { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }
    {
        const cubes = this.levelData.cubes;
        if (!cubes || cubes.length === 0)
        {
            return { minX: 0, maxX: gridSize.x - 1, minY: 0, maxY: gridSize.y - 1, minZ: 0, maxZ: gridSize.z - 1 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const cube of cubes)
        {
            if (cube.x < minX) minX = cube.x;
            if (cube.x > maxX) maxX = cube.x;
            if (cube.y < minY) minY = cube.y;
            if (cube.y > maxY) maxY = cube.y;
            if (cube.z < minZ) minZ = cube.z;
            if (cube.z > maxZ) maxZ = cube.z;
        }

        return { minX, maxX, minY, maxY, minZ, maxZ };
    }
}
