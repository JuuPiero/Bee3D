import { _decorator, Camera, CCBoolean, CCFloat, CCInteger, Color, Component, EventKeyboard, Input, input, instantiate, KeyCode, MeshRenderer, Node, Prefab, Quat, Vec3 } from 'cc';
import { LevelData3D } from '../../configData/LevelData3D';
import { GridTile3D } from './GridTile3D';
import { IGridTile3D } from './IGridTile3D';
import { ColorConfig } from '../../configData/ColorConfig';
import { EColor } from '../../enums/EColor';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { ProjectedTriangle } from './ProjectedTriangle';
import { GridMeshGrid3D, ICubePlacement } from './GridMeshGrid3D';
import { ScreenTriangleGrid } from './ScreenTriangleGrid';
import { VisibilityPass } from './VisibilityPass';
import { ViewSnapshot } from './ViewSnapshot';
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

    @property({ type: CCFloat, min: 0, group: 'Occlusion', tooltip: 'Seconds between occlusion passes. The pass is a full sweep over every cube, so it runs on this timer instead of every frame - and is skipped entirely while neither the camera nor the map has moved. findTargetTile() forces a fresh pass on demand, so raising this only adds latency to the cube show/hide, never to targeting. 0 = every frame.' })
    public visibilityRefreshInterval: number = 0.1;

    @property({ type: CCInteger, min: 0, group: 'Occlusion', tooltip: 'Max cubes resolved per frame, spreading one pass over several frames. 0 = the whole map in one frame.' })
    public visibilityTilesPerFrame: number = 0;

    @property({ type: CCBoolean, group: 'Occlusion', tooltip: 'Draws a cross at each cube (green = visible, red = hidden) using the camera\'s geometry renderer.' })
    public debugDrawVisibility: boolean = false;

    @property({ type: CCFloat, min: 0.001, group: 'Occlusion' })
    public debugPointRadius: number = 0.05;

    // Minimum cos(angle) between a face's normal and the direction to the camera for that face to
    // count as a way in: 1 = head-on only, 0.3 ~= 72° off, 0 = anything not pointing away. Stops a
    // cube whose only opening faces almost edge-on - one the player can barely see - from being
    // chosen as a target. The shipped original runs ~0.30 (its own code default of 0.70 is not the
    // value that ships).
    //
    // Targeting only. The occlusion pass deliberately does NOT use it: that pass also decides which
    // cube renderers are on, and hiding edge-on faces there would pop cubes out of the picture.
    @property({ type: CCFloat, min: 0, max: 1, step: 0.01, group: 'Reachability' })
    public facingThreshold: number = 0.3;

    // Seconds between reachability rebuilds while the map rotates. Cheap enough at these grid
    // sizes, and short enough that a shooter never picks a cube whose corridor has swung out of
    // reach. Removing a cube rebuilds immediately regardless.
    @property({ type: CCFloat, min: 0, group: 'Reachability' })
    public reachabilityRefreshInterval: number = 0.15;

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

    // Index-aligned with _solidTiles: the MeshRenderer the occlusion pass switches on and off for
    // that tile (null on the merged-mesh path). Kept as an array rather than looked up by gridKey
    // per tile per pass, which allocated a key string for every cube every frame.
    private _solidTileRenderers: (MeshRenderer | null)[] = [];

    // occlusionBoxSize scaled by cubeBlockHolder's world scale, i.e. the box in world units.
    private readonly _occlusionBoxWorldSize = new Vec3();
    private readonly _occlusionHalfExtents = new Vec3();
    private readonly _screenProjector = new ScreenProjector();
    private readonly _holderWorldRotation = new Quat();
    private readonly _holderInverseRotation = new Quat();

    // Reused by findTargetTile()'s camera-depth ranking, to avoid a per-candidate allocation.
    private readonly _targetCameraForwardScratch = new Vec3();
    private readonly _targetCameraToTileScratch = new Vec3();

    // Reused by buildBulletPath()'s corridor pick.
    private readonly _exitToCameraScratch = new Vec3();
    private readonly _exitDirWorldScratch = new Vec3();

    // colorID -> the instanced-attribute bytes for that color, built on first use.
    private readonly _cubeColorBytes = new Map<number, { color: Uint8Array, shadow: Uint8Array }>();

    // Tiles a bullet is already flying at. They stay in _solidTiles (they still occlude and still
    // block corridors) but findTargetTile() skips them, so two shooters can never pick the same
    // cube and fire two bullets at it.
    private readonly _reservedTiles = new Set<IGridTile3D>();

    // Digit key -> colorID, index-aligned (KEY_DIGIT_0 -> colorID 0, etc.).
    private static readonly DEBUG_COLOR_KEYS: readonly number[] = [
        KeyCode.DIGIT_0, KeyCode.DIGIT_1, KeyCode.DIGIT_2, KeyCode.DIGIT_3, KeyCode.DIGIT_4,
        KeyCode.DIGIT_5, KeyCode.DIGIT_6, KeyCode.DIGIT_7, KeyCode.DIGIT_8, KeyCode.DIGIT_9,
    ];

    // Reused every occlusion pass: every solid tile's occlusion box projected into up to 6
    // camera-facing triangles each, concatenated into one shared array and then bucketed by screen
    // position in _occluderGrid. Each triangle carries the index of the tile it came from, so a
    // tile's own box is skipped and it can never self-occlude.
    private _trianglePool: ProjectedTriangle[] = [];
    private _triangles: ProjectedTriangle[] = [];

    // Each solid tile's world position as of the pass in flight, index-aligned with _solidTiles for
    // the length of that pass only (a grow-only scratch pool, rewritten by every beginVisibilityPass
    // - so it needs no splicing when a cube is removed). Frozen because the map rotates: a sliced
    // pass has to keep testing samples against occluders from the same moment, and because
    // getWorldPos() returns the tile's own reused Vec3, which the next tile's call overwrites.
    private _solidTileWorldPos: Vec3[] = [];
    private readonly _occluderGrid = new ScreenTriangleGrid();
    private readonly _visibilityPass = new VisibilityPass();

    private _reachabilityTimer: number = 0;
    private _visibilityTimer: number = 0;

    // Where a time-sliced pass got to, or -1 when no pass is in flight.
    private _visibilityCursor: number = -1;

    // Set when a cube is added or removed: the last pass's results no longer describe the map, so
    // the next one must run even if nothing moved.
    private _visibilityStale: boolean = true;

    // What each pass was last computed against, so an idle frame can skip the work instead of
    // recomputing an identical answer.
    private readonly _reachabilityView = new ViewSnapshot();
    private readonly _visibilityView = new ViewSnapshot();

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
        this._solidTileRenderers.length = 0;
        for (const tile of this._gridMap.values())
        {
            if (!tile.isContainBlock()) continue;
            this._solidTiles.push(tile);
            const tileKey = LevelData3D.gridKey(tile.getCoordX(), tile.getCoordY(), tile.getCoordZ());
            this._solidTileRenderers.push(this._cubeRenderers.get(tileKey) ?? null);
        }

        this.invalidateVisibility();
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

    /**
     * The world size one cube is drawn at, so a bullet can rescale its own stand-in cube to match
     * what it just took out of the map. Same two factors the mesh is built from: the scale baked
     * into every cube's vertices, times the holder's fit scale.
     */
    public getCubeWorldScale(out: Vec3): Vec3
    {
        const holderScale = this.cubeBlockHolder ? this.cubeBlockHolder.worldScale : Vec3.ONE;
        const cubeScale = this.gridMeshGrid ? this.gridMeshGrid.cubeScale : Vec3.ONE;
        return Vec3.multiply(out, holderScale, cubeScale);
    }

    /**
     * `colorID`'s tones as the instanced-attribute byte pairs a cube renderer wants. Cached per
     * color: a bullet asks for these on every hit, and the answer never changes for a color.
     */
    public getCubeColorBytes(colorID: number): { color: Uint8Array, shadow: Uint8Array } | null
    {
        const cached = this._cubeColorBytes.get(colorID);
        if (cached) return cached;

        const blockColors = this.colorData ? this.colorData.getBlockColors(colorID as EColor) : null;
        if (!blockColors) return null;

        const bytes = {
            color: new Uint8Array([blockColors.color.r, blockColors.color.g, blockColors.color.b, blockColors.color.a]),
            shadow: new Uint8Array([blockColors.shadow.r, blockColors.shadow.g, blockColors.shadow.b, blockColors.shadow.a]),
        };
        this._cubeColorBytes.set(colorID, bytes);
        return bytes;
    }

    /** Turns a corridor direction (holder-local, from buildBulletPath) into a world direction. */
    public localDirectionToWorld(out: Vec3, localDir: Readonly<Vec3>): Vec3
    {
        this.cubeBlockHolder.getWorldRotation(this._holderWorldRotation);
        Vec3.transformQuat(out, localDir, this._holderWorldRotation);
        return out.normalize();
    }

    /**
     * The other way round - a world direction expressed in the holder's space. Used to arc a
     * bullet's approach "upwards" while it is flying in the map's rotating frame: world up has to
     * be brought into that frame or the arc tilts with the level.
     */
    public worldDirectionToLocal(out: Vec3, worldDir: Readonly<Vec3>): Vec3
    {
        this.cubeBlockHolder.getWorldRotation(this._holderWorldRotation);
        Quat.invert(this._holderInverseRotation, this._holderWorldRotation);
        Vec3.transformQuat(out, worldDir, this._holderInverseRotation);
        return out.normalize();
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

        // Drop the emptied tile from _solidTiles (and its index-aligned renderer slot) - otherwise
        // the occlusion pass keeps projecting an occlusion box for a cell that no longer holds a
        // cube, permanently blocking line-of-sight to whatever is behind it.
        if (tile)
        {
            const index = this._solidTiles.indexOf(tile);
            if (index !== -1)
            {
                this._solidTiles.splice(index, 1);
                this._solidTileRenderers.splice(index, 1);
            }
        }

        // Every remaining tile's index just shifted, and the hole may have exposed cubes behind it,
        // so any pass in flight is meaningless now - drop it and start over.
        this.invalidateVisibility();

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
        // One renderer per mesh chunk, so this goes through GridMeshGrid3D rather than a
        // MeshRenderer lookup on its node.
        this.gridMeshGrid?.setRenderersEnabled(enabled);

        const holderRenderer = this.cubeBlockHolder ? this.cubeBlockHolder.getComponent(MeshRenderer) : null;
        if (holderRenderer) holderRenderer.enabled = enabled;
    }

    private computeReachabilityForSolidTiles(): void
    {
        // Camera only: the walk reads the linked-tile chain and needs nothing from levelData now
        // that corridor length is not derived from cellSize. One less way for this to no-op
        // silently and leave every cube untargetable.
        if (!this.camera) return;

        this._reachabilityView.capture(this.camera.node, this.cubeBlockHolder);

        for (const tile of this._solidTiles)
        {
            tile.computeReachability(this.camera, this.facingThreshold);
        }
    }

    /**
     * Whether `tile`'s last computeVisibility() result clears visibilitySampleCountHideThreshold.
     * Single source of truth for "is this cube currently visible", shared by the debug draw and
     * findTargetTile()'s eligibility filter.
     */
    private isTileVisible(tile: IGridTile3D): boolean
    {
        return tile.getVisibilityResult().visibleSamples > this.visibilitySampleCountHideThreshold;
    }

    doLateUpdate(dt: number): void
    {
    }

    updateVisibilities(dt: number): void
    {
        if (!this.camera || this._solidTiles.length === 0) return;

        this.updateReachability(dt);
        this.updateVisibility(dt);

        // Outside the pass: the geometry renderer is cleared every frame, so the crosses have to be
        // re-submitted every frame even though the results behind them only change per pass.
        if (this.debugDrawVisibility) this.drawVisibilityDebug();
    }

    /**
     * Reachability is scored against the camera-facing faces, so a rotating map invalidates it
     * continuously - not just when a cube is removed. It is a full scan over every solid tile, so
     * it runs on a timer, and only when the view has actually moved since the last rebuild
     * (removing a cube rebuilds synchronously in removeCube(), so no timer is involved there).
     */
    private updateReachability(dt: number): void
    {
        this._reachabilityTimer += dt;
        if (this._reachabilityTimer < this.reachabilityRefreshInterval) return;

        // Timer stays armed while the view is still, so the next real movement is picked up at once.
        if (!this._reachabilityView.hasChanged(this.camera.node, this.cubeBlockHolder)) return;

        this._reachabilityTimer = 0;
        this.computeReachabilityForSolidTiles();
    }

    /**
     * Drives the occlusion pass. Three things keep it off the per-frame budget:
     *   - it only starts a pass every visibilityRefreshInterval seconds;
     *   - it skips even that while neither the camera nor the map has moved and no cube has been
     *     removed, since the answer would be identical;
     *   - one pass can be spread over several frames (visibilityTilesPerFrame).
     * findTargetTile() forces a fresh pass when it needs one, so none of this can hand a shooter a
     * stale target - the interval only delays the cosmetic cube show/hide.
     */
    private updateVisibility(dt: number): void
    {
        // A time-sliced pass in flight finishes first, on the occluders it started with.
        if (this._visibilityCursor >= 0)
        {
            this.stepVisibilityPass(this.visibilityTilesPerFrame);
            return;
        }

        this._visibilityTimer += dt;
        if (this._visibilityTimer < this.visibilityRefreshInterval) return;

        // Same as above: leave the timer expired so a change is acted on the frame it happens.
        if (!this._visibilityStale && !this._visibilityView.hasChanged(this.camera.node, this.cubeBlockHolder)) return;

        this._visibilityTimer = 0;
        this.beginVisibilityPass();
        this.stepVisibilityPass(this.visibilityTilesPerFrame);
    }

    /**
     * Makes sure the visibility results are current before they are read for gameplay. Cheap when
     * nothing has moved since the last pass - which is the common case for several shooters
     * querying in the same frame.
     */
    private ensureVisibilityFresh(): void
    {
        if (this._solidTiles.length === 0) return;

        if (this._visibilityCursor >= 0)
        {
            this.stepVisibilityPass(0); // finish the in-flight pass now
            return;
        }

        if (!this._visibilityStale && !this._visibilityView.hasChanged(this.camera.node, this.cubeBlockHolder)) return;

        this._visibilityTimer = 0;
        this.beginVisibilityPass();
        this.stepVisibilityPass(0);
    }

    /** Forces the next pass to run even if nothing moved - call whenever a cube is added or removed. */
    private invalidateVisibility(): void
    {
        this._visibilityStale = true;
        this._visibilityCursor = -1;
    }

    /**
     * Projects every solid tile's occlusion box into the shared triangle list, buckets those
     * triangles by screen position, and arms the pass at tile 0.
     */
    private beginVisibilityPass(): void
    {
        this._screenProjector.prepare(this.camera);

        // Same rotation for every tile (they all share cubeBlockHolder), so fetch it once.
        this.cubeBlockHolder.getWorldRotation(this._holderWorldRotation);

        // The snapshot is taken here, not at the end: a sliced pass describes the map as it was
        // when its occluders were built.
        this._visibilityView.capture(this.camera.node, this.cubeBlockHolder);
        this._visibilityStale = false;

        this._triangles.length = 0;
        let poolIndex = 0;
        for (let i = 0; i < this._solidTiles.length; i++)
        {
            // Snapshot the tile's world position, then project from the snapshot - the pass reuses
            // it for that tile's samples, so occluders and samples share one transform.
            let worldPos = this._solidTileWorldPos[i];
            if (!worldPos)
            {
                worldPos = new Vec3();
                this._solidTileWorldPos[i] = worldPos;
            }
            worldPos.set(this._solidTiles[i].getWorldPos());

            poolIndex = GridTile3D.projectOcclusionTriangles(this.camera, this._screenProjector, worldPos, this._occlusionHalfExtents, this._holderWorldRotation, i, this._trianglePool, poolIndex, this._triangles);
        }

        this._visibilityPass.prepare(this.camera, this._screenProjector, this._occluderGrid, this._holderWorldRotation, this.visibilitySampleCountHideThreshold, false);
        this._occluderGrid.build(
            this._triangles,
            this._visibilityPass.viewportMinX, this._visibilityPass.viewportMinY,
            this._visibilityPass.viewportMaxX, this._visibilityPass.viewportMaxY,
        );

        this._visibilityCursor = 0;
    }

    /**
     * Resolves up to `budget` tiles of the pass in flight (0 = all of them), and applies each
     * result to that cube's renderer. Clears the cursor once the pass is done.
     */
    private stepVisibilityPass(budget: number): void
    {
        if (this._visibilityCursor < 0) return;

        const tileCount = this._solidTiles.length;
        const end = budget > 0 ? Math.min(tileCount, this._visibilityCursor + budget) : tileCount;

        for (let i = this._visibilityCursor; i < end; i++)
        {
            const tile = this._solidTiles[i];
            tile.computeVisibility(this._visibilityPass, i, this._solidTileWorldPos[i]);

            // Feed the camera-visibility result straight into the cube's own MeshRenderer.
            // Only meaningful for the per-node path - GridMeshGrid3D has no per-cube show/hide
            // (only permanent removeBlock), so occlusion-driven hiding is dropped while
            // useMergedMesh is on; the debug cross and findTargetTile's visibility filter are
            // unaffected either way.
            if (!this.useMergedMesh)
            {
                const renderer = this._solidTileRenderers[i];
                const visible = this.isTileVisible(tile);
                if (renderer && renderer.enabled !== visible) renderer.enabled = visible;
            }
        }

        this._visibilityCursor = end >= tileCount ? -1 : end;
    }

    /** Re-submits the debug crosses for the last pass's results. */
    private drawVisibilityDebug(): void
    {
        const debugRenderer = this.camera.camera?.geometryRenderer;
        if (!debugRenderer) return;

        for (const tile of this._solidTiles)
        {
            if (!this.isTileVisible(tile)) continue;
            debugRenderer.addCross(tile.getWorldPos(), this.debugPointRadius, Color.WHITE, true);
        }
    }

    public clearLevel(): void
    {
        this._solidTiles.length = 0;
        this._solidTileRenderers.length = 0;
        this._triangles.length = 0;
        this._occluderGrid.clear();
        this._reservedTiles.clear();
        this.invalidateVisibility();
        this._reachabilityView.invalidate();

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

        // The occlusion pass runs on an interval, so bring it up to date before its results decide
        // a shot. No-ops unless the view moved or a cube was removed since the last pass.
        this.ensureVisibilityFresh();

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

    /**
     * Every color that still has at least one cube a bee could fly into - i.e. the colors a shooter
     * could still be given a target for. Written into `out`, which is cleared first.
     *
     * This is findTargetTile()'s gate minus the two filters that say "not right now" rather than
     * "not at all":
     *   - VISIBILITY is left out on purpose. A cube hidden behind another is still perfectly
     *     shootable once the pile in front of it is peeled or the player turns the map, so counting
     *     it as gone would call a level lost that is still winnable.
     *   - RESERVATION is left out for the same reason: a reserved cube is one a bullet is already on
     *     its way to, which is progress, not a dead end.
     * Reachability itself stays in, since that is the actual "can a bee get to it" test.
     *
     * Only used by the lose check, which runs on a stuck conveyor - a plain scan over the solid
     * tiles, reading the reachability flag each one already carries.
     */
    public collectReachableColors(out: Set<number>): Set<number>
    {
        out.clear();
        for (const tile of this._solidTiles)
        {
            if (!tile.isReachable()) continue;
            out.add(tile.getColorID());
        }
        return out;
    }

    /** Whether any cube is currently claimed by a bullet in flight. */
    public hasReservedTiles(): boolean
    {
        return this._reservedTiles.size > 0;
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
     * Clearance comes from GridTile3D.isCorridorClearOfGrid() - the SAME test computeReachability()
     * gates targets on, so a tile that passed findTargetTile() cannot fail to produce a path here.
     * Keep it that way: a second, subtly different walk on this side is exactly the bug that made
     * shooters loop on an unshootable target (see computeReachability's note).
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

        let bestFace = -1;
        let bestScore = -Infinity;

        for (let face = 0; face < GridTile3D.faceCount; face++)
        {
            if (!GridTile3D.isCorridorClearOfGrid(tile, face)) continue;

            Vec3.transformQuat(this._exitDirWorldScratch, GridTile3D.getFaceNormal(face), this._holderWorldRotation);
            const score = Vec3.dot(this._exitDirWorldScratch, this._exitToCameraScratch);
            if (score > bestScore)
            {
                bestScore = score;
                bestFace = face;
            }
        }

        if (bestFace < 0) return null;

        const path: Vec3[] = [ tile.getLocalPos().clone() ];

        let current: IGridTile3D = tile;
        while (true)
        {
            const next = GridTile3D.getFaceNeighbor(current, bestFace);
            if (!next) break;
            path.push(next.getLocalPos().clone());
            current = next;
        }

        // Corridor mouth: one cell past the last in-grid cell, so the straight leg the bullet
        // flies in from the shooter ends outside the pile rather than inside it - and so the
        // fly-out leg starts from a point that is already clear of every remaining cube. The
        // tiles sit on a 1-unit lattice, so one cell is exactly the face normal.
        const exitDir = GridTile3D.getFaceNormal(bestFace);
        const lastCell = path[path.length - 1];
        path.push(new Vec3(lastCell.x + exitDir.x, lastCell.y + exitDir.y, lastCell.z + exitDir.z));

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
