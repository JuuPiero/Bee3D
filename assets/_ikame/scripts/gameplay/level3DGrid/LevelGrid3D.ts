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

    // How far (world units) a bee needs to pull a cube straight out to dock and extract it.
    // Drives both the straight-corridor length (ceil(R / cellSize) + 2 cells) and the
    // L-route exit distance (R + cellSize) in GridTile3D.computeReachability().
    @property({ type: CCFloat, min: 0, group: 'Reachability' })
    public extractionRadius: number = 0.5;

    // Max 90° turns a greedy L-route is allowed before giving up on a candidate exit face.
    @property({ type: CCInteger, min: 0, group: 'Reachability' })
    public reachabilityTurnCap: number = 2;

    public levelData: LevelData3D = null;

    private _gridMap = new Map<string, GridTile3D>();

    // Every tile currently holding a cube. Hiding by topology (all 6 neighbours filled) is
    // handled entirely by GridMapMesh3D itself, event-driven off removeCube() - nothing here
    // needs to poll it every frame. This list only feeds the debug visibility computation.
    private _solidTiles: GridTile3D[] = [];

    private readonly _occlusionHalfExtents = new Vec3();
    private readonly _screenProjector = new ScreenProjector();
    private readonly _holderWorldRotation = new Quat();

    // Reused by findTargetTile()'s camera-depth ranking, to avoid a per-candidate allocation.
    private readonly _targetCameraForwardScratch = new Vec3();
    private readonly _targetCameraToTileScratch = new Vec3();

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

        this.computeReachabilityForSolidTiles();

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

        const removed = this.gridMapMesh.removeCube(x, y, z);

        // Removing a cube can open a corridor for its neighbours, so recompute reachability
        // for every remaining solid tile - the same full-rebuild approach _solidTiles itself
        // already uses, and cheap enough at these grid sizes.
        if (removed) this.computeReachabilityForSolidTiles();

        return removed;
    }

    private computeReachabilityForSolidTiles(): void
    {
        if (!this.camera || !this.levelData) return;

        for (const tile of this._solidTiles)
        {
            tile.computeReachability(this.camera, this.extractionRadius, this.levelData.cellSize, this.reachabilityTurnCap);
        }
    }

    /**
     * Whether `tile`'s last computeVisibility() result clears visibilitySampleCountHideThreshold.
     * Single source of truth for "is this cube currently visible", shared by lateUpdate()'s
     * debug draw and findTargetTile()'s eligibility filter.
     */
    private isTileVisible(tile: GridTile3D): boolean
    {
        return tile.getVisibilityResult().visibleSamples > this.visibilitySampleCountHideThreshold;
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

            tile.computeVisibility(this.camera, this._screenProjector, this._triangles, excludeStart, excludeEnd);

            if (debugRenderer && this.isTileVisible(tile))
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

    /**
     * Picks the single best cube to target for `colorID`, among every currently reachable cube
     * of that color, using the fixed peel order:
     *   1st - top of the pile (highest row, i.e. highest Y)
     *   2nd - nearest front slab (closest camera-facing Z layer)
     *   3rd - right -> left across the row (highest X first)
     *   4th - exact depth (precise camera depth, tie-break safety net - in practice unreachable
     *         since (x, y, z) is unique per tile, so the first three keys already fully order
     *         any two distinct candidates)
     * A candidate must also currently be visible (its last computeVisibility() result clears
     * visibilitySampleCountHideThreshold) - reachable-but-hidden cubes aren't pull-able yet.
     * Returns null if no solid tile of that color is currently reachable and visible.
     */
    public findTargetTile(colorID: number): IGridTile3D | null
    {
        if (!this.camera) return null;

        const candidates = this._solidTiles.filter(tile =>
            tile.isMatchingColorID(colorID) &&
            tile.isReachable() &&
            this.isTileVisible(tile)
        );
        if (candidates.length === 0) return null;

        const cameraPos = this.camera.node.worldPosition;
        Vec3.transformQuat(this._targetCameraForwardScratch, Vec3.FORWARD, this.camera.node.worldRotation);

        const cameraDepthOf = (tile: GridTile3D): number =>
        {
            const worldPos = tile.getWorldPos();
            this._targetCameraToTileScratch.set(worldPos.x - cameraPos.x, worldPos.y - cameraPos.y, worldPos.z - cameraPos.z);
            return Vec3.dot(this._targetCameraToTileScratch, this._targetCameraForwardScratch);
        };

        let best = candidates[0];
        let bestDepth = cameraDepthOf(best);

        for (let i = 1; i < candidates.length; i++)
        {
            const candidate = candidates[i];

            // 1st: highest row wins outright.
            if (candidate.getCoordY() !== best.getCoordY())
            {
                if (candidate.getCoordY() > best.getCoordY())
                {
                    best = candidate;
                    bestDepth = cameraDepthOf(candidate);
                }
                continue;
            }

            const candidateDepth = cameraDepthOf(candidate);

            // 2nd: same row - nearest-to-camera Z layer wins.
            if (candidate.getCoordZ() !== best.getCoordZ())
            {
                if (candidateDepth < bestDepth)
                {
                    best = candidate;
                    bestDepth = candidateDepth;
                }
                continue;
            }

            // 3rd: same row and slab - rightmost (highest X) wins.
            if (candidate.getCoordX() !== best.getCoordX())
            {
                if (candidate.getCoordX() > best.getCoordX())
                {
                    best = candidate;
                    bestDepth = candidateDepth;
                }
                continue;
            }

            // 4th: exact-depth safety net (row/slab/X all tied).
            if (candidateDepth < bestDepth)
            {
                best = candidate;
                bestDepth = candidateDepth;
            }
        }

        return best;
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
