import { _decorator, Camera, CCBoolean, CCFloat, CCInteger, Color, Component, EventKeyboard, Input, input, instantiate, JsonAsset, KeyCode, MeshRenderer, Node, Prefab, Quat, Vec3 } from 'cc';
import { LevelData3D } from '../../configData/LevelData3D';
import { GridTile3D } from './GridTile3D';
import { IGridTile3D } from './IGridTile3D';
import { ColorConfig } from '../../configData/ColorConfig';
import { EColor } from '../../enums/EColor';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { ProjectedTriangle } from './ProjectedTriangle';
const { ccclass, property } = _decorator;

@ccclass('LevelGrid3D')
export class LevelGrid3D extends Component
{
    @property({ type: Node, group: 'Cube Map' })
    public cubeBlockHolder: Node = null;

    @property({ type: Prefab, group: 'Cube Map' })
    public cubePrefab: Prefab = null;

    @property({ type: ColorConfig, group: 'Cube Map' })
    public colorData: ColorConfig = null;

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

    // Debug-only: press number keys 0-9 to call findTargetTile(colorID) and remove it, like a
    // bee pulling that cube out, so the peel-order logic can be sanity-checked directly in the
    // running scene.
    @property({ type: CCBoolean, group: 'Debug' })
    public debugFindTargetOnNumberKeys: boolean = true;

    @property({ type: CCInteger, group: 'Debug' })
    public debugRemoveID: number;

    public levelData: LevelData3D = null;

    private _gridMap = new Map<string, GridTile3D>();

    // One prefab instance per spawned cube, keyed the same way as _gridMap. Simple and correct
    // over clever: no merged mesh, no enclosure culling - every cube is a real node, shown or
    // destroyed directly.
    private _cubeNodes = new Map<string, Node>();
    private _cubeRenderers = new Map<string, MeshRenderer>();

    // Every tile currently holding a cube. This list feeds the debug visibility computation
    // and the camera-occlusion show/hide below.
    private _solidTiles: GridTile3D[] = [];

    private readonly _occlusionHalfExtents = new Vec3();
    private readonly _screenProjector = new ScreenProjector();
    private readonly _holderWorldRotation = new Quat();

    // Reused by findTargetTile()'s camera-depth ranking, to avoid a per-candidate allocation.
    private readonly _targetCameraForwardScratch = new Vec3();
    private readonly _targetCameraToTileScratch = new Vec3();

    // Digit key -> colorID, index-aligned (KEY_DIGIT_0 -> colorID 0, etc.).
    private static readonly DEBUG_COLOR_KEYS: readonly number[] = [
        KeyCode.DIGIT_0, KeyCode.DIGIT_1, KeyCode.DIGIT_2, KeyCode.DIGIT_3, KeyCode.DIGIT_4,
        KeyCode.DIGIT_5, KeyCode.DIGIT_6, KeyCode.DIGIT_7, KeyCode.DIGIT_8, KeyCode.DIGIT_9,
    ];

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

        input.on(Input.EventType.KEY_DOWN, this.onDebugKeyDown, this);
    }

    onDestroy(): void
    {
        input.off(Input.EventType.KEY_DOWN, this.onDebugKeyDown, this);
    }

    /** Debug: number keys 0-9 call findTargetTile(colorID) and remove it, like a bee pulling that cube out. */
    private onDebugKeyDown(event: EventKeyboard): void
    {
        if (!this.debugFindTargetOnNumberKeys || event.keyCode !== KeyCode.SPACE) return;

        const colorID = this.debugRemoveID
        if (colorID === -1) return;

        const target = this.findTargetTile(colorID);
        if (!target)
        {
            console.log(`[LevelGrid3D] findTargetTile(${colorID}): no reachable+visible cube found.`);
            return;
        }

        const x = target.getCoordX(), y = target.getCoordY(), z = target.getCoordZ();
        const removed = this.removeCube(x, y, z);
        console.log(`[LevelGrid3D] findTargetTile(${colorID}) -> (${x}, ${y}, ${z}), removeCube: ${removed}`);
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

        if (!this.cubePrefab)
        {
            console.error('[LevelGrid3D] cubePrefab is not assigned.');
            return;
        }

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
            this.spawnCubeNode(key, cubeData.color, gridTile.getLocalPos());

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

        this.computeReachabilityForSolidTiles();

        console.log(`[LevelGrid3D] Grid ${gridSize.x}x${gridSize.y}x${gridSize.z}, tiles: ${this._gridMap.size}, spawned ${spawnedCount}/${this.levelData.cubes.length} cube nodes`);
    }

    /** Instantiates one cube prefab at `localPos`, colors it, and caches it under `key`. */
    private spawnCubeNode(key: string, colorID: number, localPos: Vec3): void
    {
        const node = instantiate(this.cubePrefab);
        node.setParent(this.cubeBlockHolder);
        node.setPosition(localPos);

        const meshRenderer = node.getComponent(MeshRenderer);
        const blockColors = this.colorData ? this.colorData.getBlockColors(colorID as EColor) : null;
        if (meshRenderer && blockColors)
        {
            this.scheduleOnce( () => 
            {
                const colorBytes = new Uint8Array([blockColors.color.r, blockColors.color.g, blockColors.color.b, blockColors.color.a]);
                const shadowBytes = new Uint8Array([blockColors.shadow.r, blockColors.shadow.g, blockColors.shadow.b, blockColors.shadow.a]);
                meshRenderer.setInstancedAttribute('a_instColor', colorBytes);
                meshRenderer.setInstancedAttribute('a_instColorShadow', shadowBytes);
            }, 0.2)
        }

        this._cubeNodes.set(key, node);
        if (meshRenderer) this._cubeRenderers.set(key, meshRenderer);
    }

    /** Destroys the cube's node at (x, y, z) and clears its tile data. */
    public removeCube(x: number, y: number, z: number): boolean
    {
        const key = LevelData3D.gridKey(x, y, z);
        const tile = this._gridMap.get(key);
        const node = this._cubeNodes.get(key);

        if (!node)
        {
            // GridTile3D and _cubeNodes are two independent data stores keyed the same way -
            // if the tile thinks it holds a cube but there's no node for it, they've desynced.
            // Surface it loudly instead of returning a silent false.
            if (tile?.isContainBlock())
            {
                console.warn(`[LevelGrid3D] removeCube(${x}, ${y}, ${z}): GridTile3D reports a block here but no cube node was found - data is desynced.`);
            }
            return false;
        }

        node.destroy();
        this._cubeNodes.delete(key);
        this._cubeRenderers.delete(key);

        tile?.clearCubeData();

        // Drop the emptied tile from _solidTiles (and its index-aligned triangle-bookkeeping
        // slots) - otherwise lateUpdate() keeps projecting an occlusion box for a cell that no
        // longer holds a cube, permanently blocking line-of-sight to whatever is behind it.
        if (tile)
        {
            const index = this._solidTiles.indexOf(tile);
            if (index !== -1)
            {
                this._solidTiles.splice(index, 1);
                this._tileTriangleStart.splice(index, 1);
                this._tileTriangleCount.splice(index, 1);
            }
        }

        // Removing a cube can open a corridor for its neighbours, so recompute reachability
        // for every remaining solid tile - the same full-rebuild approach _solidTiles itself
        // already uses, and cheap enough at these grid sizes.
        this.computeReachabilityForSolidTiles();

        return true;
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

            // Feed the camera-visibility result straight into the cube's own MeshRenderer -
            // no merged mesh, no enclosure culling, just toggle whether this node draws.
            const visible = this.isTileVisible(tile);
            const key = LevelData3D.gridKey(tile.getCoordX(), tile.getCoordY(), tile.getCoordZ());
            const renderer = this._cubeRenderers.get(key);
            if (renderer) renderer.enabled = visible;

            if (debugRenderer && visible)
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

        for (const node of this._cubeNodes.values()) node.destroy();
        this._cubeNodes.clear();
        this._cubeRenderers.clear();

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
