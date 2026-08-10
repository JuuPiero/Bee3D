import { _decorator, Camera, CCBoolean, CCFloat, CCInteger, Color, Component, EventKeyboard, Input, input, instantiate, KeyCode, MeshRenderer, Node, Prefab, Quat, Vec3 } from 'cc';
import { LevelData3D } from '../../configData/LevelData3D';
import { GridTile3D } from './GridTile3D';
import { IGridTile3D } from './IGridTile3D';
import { ColorConfig } from '../../configData/ColorConfig';
import { EColor } from '../../enums/EColor';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { ProjectedTriangle } from './ProjectedTriangle';
import { GridMeshGrid3D, ICubePlacement } from './GridMeshGrid3D';
const { ccclass, property } = _decorator;

// Seconds between reachability rebuilds while the map rotates. Cheap enough at these grid sizes,
// and short enough that a shooter never picks a cube whose corridor has swung out of reach.
const REACHABILITY_REFRESH_INTERVAL = 0.15;

@ccclass('LevelGrid3D')
export class LevelGrid3D extends Component
{
    @property({ type: Node, group: 'Cube Map' })
    public cubeBlockHolder: Node = null;

    @property({ type: Prefab, group: 'Cube Map' })
    public cubePrefab: Prefab = null;

    @property({ type: ColorConfig, group: 'Cube Map' })
    public colorData: ColorConfig = null;

    @property({ type: CCBoolean, group: 'Cube Map', tooltip: 'Off: instantiate cubePrefab per cube (default, proven path). On: build one merged mesh via gridMeshGrid instead - no per-cube nodes, so occlusion-driven hide/show and per-cube animation are unavailable while this is on.' })
    public useMergedMesh: boolean = false;

    @property({ type: GridMeshGrid3D, group: 'Cube Map', tooltip: 'Only used when useMergedMesh is on.' })
    public gridMeshGrid: GridMeshGrid3D = null;

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

    // occlusionBoxSize scaled by cubeBlockHolder's world scale, i.e. the box in world units.
    private readonly _occlusionBoxWorldSize = new Vec3();
    private readonly _occlusionHalfExtents = new Vec3();
    private readonly _screenProjector = new ScreenProjector();
    private readonly _holderWorldRotation = new Quat();

    // Reused by findTargetTile()'s camera-depth ranking, to avoid a per-candidate allocation.
    private readonly _targetCameraForwardScratch = new Vec3();
    private readonly _targetCameraToTileScratch = new Vec3();

    // Reused by buildBulletPath()'s corridor pick.
    private readonly _exitToCameraScratch = new Vec3();
    private readonly _exitDirWorldScratch = new Vec3();

    // Tiles a bullet is already flying at. They stay in _solidTiles (they still occlude and still
    // block corridors) but findTargetTile() skips them, so two shooters can never pick the same
    // cube and fire two bullets at it.
    private readonly _reservedTiles = new Set<IGridTile3D>();

    // Local-space axis + matching neighbour getter, per cube face. Drives buildBulletPath()'s
    // straight-corridor scan the same way FACE_NEIGHBORS drives GridTile3D's reachability.
    private static readonly EXIT_DIRECTIONS: readonly { dir: Vec3, getNeighbor: (tile: IGridTile3D) => IGridTile3D }[] = [
        { dir: new Vec3(0, 1, 0), getNeighbor: t => t.getUpLinkedTile() },      // +Y
        { dir: new Vec3(0, -1, 0), getNeighbor: t => t.getDownLinkedTile() },   // -Y
        { dir: new Vec3(0, 0, -1), getNeighbor: t => t.getTopLinkedTile() },    // -Z
        { dir: new Vec3(0, 0, 1), getNeighbor: t => t.getBottomLinkedTile() },  // +Z
        { dir: new Vec3(-1, 0, 0), getNeighbor: t => t.getLeftLinkedTile() },   // -X
        { dir: new Vec3(1, 0, 0), getNeighbor: t => t.getRightLinkedTile() },   // +X
    ];

    // Digit key -> colorID, index-aligned (KEY_DIGIT_0 -> colorID 0, etc.).
    private static readonly DEBUG_COLOR_KEYS: readonly number[] = [
        KeyCode.DIGIT_0, KeyCode.DIGIT_1, KeyCode.DIGIT_2, KeyCode.DIGIT_3, KeyCode.DIGIT_4,
        KeyCode.DIGIT_5, KeyCode.DIGIT_6, KeyCode.DIGIT_7, KeyCode.DIGIT_8, KeyCode.DIGIT_9,
    ];

    // Reused every lateUpdate(): every solid tile's occlusion box projected into up to 12
    // triangles each, concatenated into one shared array. _tileTriangleStart/_tileTriangleCount
    // (index-aligned with _solidTiles) mark each tile's own slice, which computeVisibility
    // skips so a tile can never self-occlude.
    private _reachabilityTimer: number = 0;

    private _trianglePool: ProjectedTriangle[] = [];
    private _triangles: ProjectedTriangle[] = [];
    private _tileTriangleStart: number[] = [];
    private _tileTriangleCount: number[] = [];

    start()
    {
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

    /**
     * Builds the grid and its cubes from `levelData`, which the caller owns and has already
     * parsed - LevelController reads the level JSON once and shares the result between this grid
     * and the shooter queues, so this component never touches a JsonAsset itself.
     */
    public spawnLevel(levelData: LevelData3D): void
    {
        if (!levelData)
        {
            console.error('[LevelGrid3D] spawnLevel() called without level data - nothing spawned.');
            return;
        }

        this.levelData = levelData;

        // A previous level that was cleared to the last cube switched these off (see
        // disableMeshIfCleared) - turn them back on before spawning into them.
        this.setMeshRenderersEnabled(true);

        const gridSize = this.levelData.gridSize;

        const cubeBounds = LevelGrid3D.computeCubeBounds(this.levelData);
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

        // occlusionBoxSize is authored in cube units (1 = one cell), but the samples and box
        // corners derived from it are added to world-space tile positions. cubeBlockHolder is
        // scaled to fit the level inside the map border, so the box has to be scaled with it -
        // otherwise every cube keeps a full-size occluder and swallows its neighbours.
        const holderScale = this.cubeBlockHolder.worldScale;
        this._occlusionBoxWorldSize.set(
            Math.abs(this.occlusionBoxSize.x * holderScale.x),
            Math.abs(this.occlusionBoxSize.y * holderScale.y),
            Math.abs(this.occlusionBoxSize.z * holderScale.z),
        );
        this._occlusionHalfExtents.set(
            this._occlusionBoxWorldSize.x * 0.5,
            this._occlusionBoxWorldSize.y * 0.5,
            this._occlusionBoxWorldSize.z * 0.5,
        );
        GridTile3D.configureOcclusion(this._occlusionBoxWorldSize, this.occlusionSampleGridSize, this.occlusionSampleMargin);

        if (this.useMergedMesh)
        {
            if (!this.gridMeshGrid)
            {
                console.error('[LevelGrid3D] useMergedMesh is on but gridMeshGrid is not assigned.');
                return;
            }
        }
        else if (!this.cubePrefab)
        {
            console.error('[LevelGrid3D] cubePrefab is not assigned.');
            return;
        }

        // Only populated (and only meaningful) when useMergedMesh is on - GridMeshGrid3D.build()
        // wants every cube up front rather than one-at-a-time like spawnCubeNode().
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

            if (this.useMergedMesh)
            {
                placements.push({
                    x: cubeData.x,
                    y: cubeData.y,
                    z: cubeData.z,
                    colorID: cubeData.color,
                    localPos: gridTile.getLocalPos(),
                });
            }
            else
            {
                this.spawnCubeNode(key, cubeData.color, gridTile.getLocalPos());
            }

            spawnedCount++;
        }

        if (this.useMergedMesh)
        {
            this.gridMeshGrid.build(placements);
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

        console.log(`[LevelGrid3D] Grid ${gridSize.x}x${gridSize.y}x${gridSize.z}, tiles: ${this._gridMap.size}, spawned ${spawnedCount}/${this.levelData.cubes.length} cubes (${this.useMergedMesh ? 'merged mesh' : 'prefab nodes'})`);
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

    /** Removes the cube at (x, y, z) from whichever rendering path is active, and clears its tile data. */
    public removeCube(x: number, y: number, z: number): boolean
    {
        const key = LevelData3D.gridKey(x, y, z);
        const tile = this._gridMap.get(key);

        let removed: boolean;
        if (this.useMergedMesh)
        {
            removed = this.gridMeshGrid ? this.gridMeshGrid.removeBlock(x, y, z) : false;
        }
        else
        {
            const node = this._cubeNodes.get(key);
            removed = !!node;
            if (node)
            {
                node.destroy();
                this._cubeNodes.delete(key);
                this._cubeRenderers.delete(key);
            }
        }

        if (!removed)
        {
            // GridTile3D and the active rendering path are two independent data stores keyed
            // the same way - if the tile thinks it holds a cube but the renderer disagrees,
            // they've desynced. Surface it loudly instead of returning a silent false.
            if (tile?.isContainBlock())
            {
                console.warn(`[LevelGrid3D] removeCube(${x}, ${y}, ${z}): GridTile3D reports a block here but the ${this.useMergedMesh ? 'merged mesh' : 'cube node map'} could not remove it - data is desynced.`);
            }
            return false;
        }

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

        this.disableMeshIfCleared();

        return true;
    }

    /**
     * Stops drawing the cube map once its last cube is gone. Only the MeshRenderer is switched
     * off, never the node: bullets are parented to cubeBlockHolder while they fly their corridor,
     * and deactivating it would take the in-flight ones down with it.
     */
    private disableMeshIfCleared(): void
    {
        if (this._solidTiles.length > 0) return;

        this.setMeshRenderersEnabled(false);
    }

    /** Toggles the cube map's own renderers - the merged mesh, and any renderer on the holder. */
    private setMeshRenderersEnabled(enabled: boolean): void
    {
        const meshRenderer = this.gridMeshGrid ? this.gridMeshGrid.getComponent(MeshRenderer) : null;
        if (meshRenderer) meshRenderer.enabled = enabled;

        const holderRenderer = this.cubeBlockHolder ? this.cubeBlockHolder.getComponent(MeshRenderer) : null;
        if (holderRenderer) holderRenderer.enabled = enabled;
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

    lateUpdate(dt: number): void
    {
        if (!this.camera || this._solidTiles.length === 0) return;

        // Reachability is scored against the camera-facing faces, so a rotating map invalidates
        // it continuously - not just when a cube is removed. Recompute on a timer rather than
        // every frame: it is a full scan over every solid tile, and the answer only changes as
        // fast as the map turns.
        this._reachabilityTimer += dt;
        if (this._reachabilityTimer >= REACHABILITY_REFRESH_INTERVAL)
        {
            this._reachabilityTimer = 0;
            this.computeReachabilityForSolidTiles();
        }

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

            const visible = this.isTileVisible(tile);

            // Feed the camera-visibility result straight into the cube's own MeshRenderer.
            // Only meaningful for the per-node path - GridMeshGrid3D has no per-cube show/hide
            // (only permanent removeBlock), so occlusion-driven hiding is dropped while
            // useMergedMesh is on; the debug cross and findTargetTile's visibility filter
            // below are unaffected either way.
            if (!this.useMergedMesh)
            {
                const key = LevelData3D.gridKey(tile.getCoordX(), tile.getCoordY(), tile.getCoordZ());
                const renderer = this._cubeRenderers.get(key);
                if (renderer) renderer.enabled = visible;
            }

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
        this._reservedTiles.clear();

        for (const node of this._cubeNodes.values()) node.destroy();
        this._cubeNodes.clear();
        this._cubeRenderers.clear();

        this.gridMeshGrid?.clear();

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
            !this._reservedTiles.has(tile) &&
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

    /** Marks `tile` as already being shot at, so findTargetTile() stops handing it out. */
    public reserveTile(tile: IGridTile3D): void
    {
        if (tile) this._reservedTiles.add(tile);
    }

    /** Undoes reserveTile() - call once the bullet has landed (or was cancelled). */
    public releaseTile(tile: IGridTile3D): void
    {
        if (tile) this._reservedTiles.delete(tile);
    }

    /**
     * The corridor a bullet may travel along to reach `tile` without touching any other cube, in
     * cubeBlockHolder's LOCAL space, ordered from the cube outward:
     *   [0]     the target cube itself
     *   [1..n]  every empty cell between it and the edge of the pile
     *   [last]  the corridor mouth, one cell past the last one - outside the grid, so it is where
     *           a bullet enters, and where it is clear of the pile again on the way out
     * The corridor is a straight run along whichever unsealed face is clear all the way out of
     * the grid and points most towards the camera, so a bullet flying it (in either direction)
     * only ever passes through empty cells. Returns null when every face is blocked.
     *
     * Local, not world, because the level keeps rotating: a world-space snapshot would be stale
     * the moment the holder turned, and the bullet would fly at where the cube used to be. In
     * local space the corridor is fixed relative to the cubes, so a bullet parented to
     * cubeBlockHolder can just follow these positions directly and stay inside the corridor no
     * matter how the map spins. The face choice is still scored against the camera in world
     * space, i.e. picked for how the map looks at the moment of the shot.
     *
     * A fresh array each call on purpose: lerpMultiplePoints() caches arc lengths keyed by array
     * identity, so a reused-and-rewritten array would be interpolated with stale distances.
     */
    public buildBulletPath(tile: IGridTile3D): Vec3[] | null
    {
        if (!tile || !this.camera || !this.levelData) return null;

        this.cubeBlockHolder.getWorldRotation(this._holderWorldRotation);

        const tileWorldPos = tile.getWorldPos();
        const cameraPos = this.camera.node.worldPosition;
        this._exitToCameraScratch.set(
            cameraPos.x - tileWorldPos.x,
            cameraPos.y - tileWorldPos.y,
            cameraPos.z - tileWorldPos.z,
        );
        this._exitToCameraScratch.normalize();

        let bestEntry: (typeof LevelGrid3D.EXIT_DIRECTIONS)[number] | null = null;
        let bestScore = -Infinity;

        for (const entry of LevelGrid3D.EXIT_DIRECTIONS)
        {
            let isClear = true;
            let current: IGridTile3D = tile;
            while (true)
            {
                const next = entry.getNeighbor(current);
                if (!next) break;                                  // walked out of the grid: clear
                if (next.isContainBlock()) { isClear = false; break; }
                current = next;
            }
            if (!isClear) continue;

            Vec3.transformQuat(this._exitDirWorldScratch, entry.dir, this._holderWorldRotation);
            const score = Vec3.dot(this._exitDirWorldScratch, this._exitToCameraScratch);
            if (score > bestScore)
            {
                bestScore = score;
                bestEntry = entry;
            }
        }

        if (!bestEntry) return null;

        const path: Vec3[] = [ tile.getLocalPos().clone() ];

        let current: IGridTile3D = tile;
        while (true)
        {
            const next = bestEntry.getNeighbor(current);
            if (!next) break;
            path.push(next.getLocalPos().clone());
            current = next;
        }

        // Corridor mouth: one cell past the last in-grid cell, so the straight leg the bullet
        // flies in from the shooter ends outside the pile rather than inside it - and so the
        // fly-out leg starts from a point that is already clear of every remaining cube. The
        // tiles sit on a 1-unit lattice, so one cell is exactly the direction vector.
        const lastCell = path[path.length - 1];
        path.push(new Vec3(lastCell.x + bestEntry.dir.x, lastCell.y + bestEntry.dir.y, lastCell.z + bestEntry.dir.z));

        return path;
    }

    /**
     * World units per grid cell - the holder's (uniform) fit scale. Callers working in local
     * space need it to convert a local distance into a world one, e.g. for travel time.
     */
    public getCellWorldSize(): number
    {
        const scale = this.cubeBlockHolder.worldScale;
        return Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    }



    /**
     * Local-space size of the box the spawned cubes occupy, in cube units (tiles sit on a
     * 1-unit lattice, so a span of N cells is N units wide). LevelController uses this to scale
     * cubeBlockHolder so the level fits inside the map border - which is why it is static: the
     * fit has to be applied before spawnLevel() runs, so the occlusion box is sized against the
     * final holder scale.
     */
    public static computeCubeMapSize(levelData: LevelData3D, out: Vec3 = new Vec3()): Vec3
    {
        if (!levelData) return out.set(0, 0, 0);

        const bounds = LevelGrid3D.computeCubeBounds(levelData);
        return out.set(
            bounds.maxX - bounds.minX + 1,
            bounds.maxY - bounds.minY + 1,
            bounds.maxZ - bounds.minZ + 1,
        );
    }

    private static computeCubeBounds(levelData: LevelData3D): { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }
    {
        const gridSize = levelData.gridSize;
        const cubes = levelData.cubes;
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
