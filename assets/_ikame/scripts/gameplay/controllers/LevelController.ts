import { _decorator, AudioClip, BoxCollider, Camera, CCBoolean, CCInteger, Color, Component, easing, EventKeyboard, EventTouch, geometry, Input, input, JsonAsset, KeyCode, Node, PhysicsSystem, tween, Vec2, Vec3 } from 'cc';
import { LevelData3D, ShooterSpawnData3D } from '../../configData/LevelData3D';
import { EDITOR, PREVIEW } from 'cc/env';
import { EColor } from '../../enums/EColor';
import { EDirection } from '../../enums/EDirection';
import { ILevelController } from './ILevelController';
import { IGridTile } from '../flows/MapTiles/IGridTile';
import { ColorQueueControllers } from '../queues/ColorQueueControllers';
import { SplineSmooth } from '../../splines/SplineSmooth';
import { Conveyor } from '../flows/Conveyor/Conveyor';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { ICacheSlotController } from '../cacheSlots/ICacheSlotController';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../designPatterns/observer/EventName';
import { IShooterItem } from '../flows/ShooterItem/IShooterItem';
import { BulletPooling } from '../../pooling/BulletPooling';
import { Floater } from '../flows/Floater/Floater';
import { ETrackingEvent, TrackingManager } from '../../base-script/PlayableAds/Tracking/TrackingManager';
import { LevelScaler } from '../LevelScaler';
import { IPixelBlock } from '../flows/Block/IPixelBlock';
import { PixelBlock } from '../flows/Block/PixelBlock';
import { LevelGrid3D } from '../level3DGrid/LevelGrid3D';
import { IGridTile3D } from '../level3DGrid/IGridTile3D';
import { lerpMultiplePoints, quadraticBezier } from '../../utils/MathUtils';
import { BulletItem } from '../flows/Bullet/BulletItem';
const { ccclass, property } = _decorator;

// World units per second, shared by both legs of a bullet's flight.
const BULLET_SPEED = 22;

// How far outside the map's own bounds a bullet's fly-out route is kept, so it never grazes a
// cube that is still standing.
const EXIT_CLEARANCE = 1;

// The beat the bee spends settled on the cube's face, gripping, before it heaves. The cube is
// still part of the wall for this - without the pause the grab reads as the bee passing through.
const LAND_HOVER_DURATION = 0.12;

// The plug-out: how far (in grid cells) and how fast the bullet yanks the cube straight out of
// its cell before settling into carrying it down the corridor.
const POP_DISTANCE_CELLS = 0.9;
const POP_DURATION = 0.14;

// Bee flight over open air: how far the path bows off the straight line, as a fraction of the
// leg's own length. The sideways weave over that bow belongs to BulletItem.
const ARC_HEIGHT_RATIO = 0.35;

@ccclass('LevelController')
export class LevelController extends Component implements ILevelController
{

    private _isFinished: boolean = false;

    // Owns the whole cube map now: grid construction, cube spawning, occlusion and target
    // picking all live in here. LevelController only parses the level once and drives it.
    @property({ type: LevelGrid3D, group: 'Cube Map' })
    public levelGrid3D: LevelGrid3D = null;

    public levelData: LevelData3D = null;

    // The playable volume, authored as a box in the scene. Replaces the old topLeft/botRight
    // corner nodes: those only described a flat XZ rectangle, which cannot bound a cube map
    // that also stacks upward. Its size/center are read in world space, so moving, scaling or
    // resizing the collider in the editor re-fits the level.
    @property({ type: BoxCollider, group: 'MapBorder' })
    public levelBoundBox: BoxCollider = null;

    public get maxX(): number { return this.BoundsCenter.x + this.BoundsSize.x * 0.5; }
    public get minX(): number { return this.BoundsCenter.x - this.BoundsSize.x * 0.5; }
    public get maxY(): number { return this.BoundsCenter.y + this.BoundsSize.y * 0.5; }
    public get minY(): number { return this.BoundsCenter.y - this.BoundsSize.y * 0.5; }
    public get maxZ(): number { return this.BoundsCenter.z + this.BoundsSize.z * 0.5; }
    public get minZ(): number { return this.BoundsCenter.z - this.BoundsSize.z * 0.5; }

    private _boundsCenter: Vec3 = new Vec3();
    private _boundsSize: Vec3 = new Vec3();
    @property({ type: Camera })
    private cameraMain: Camera = null;

    @property({ type: CCBoolean, group: 'Debug' })
    public debugDrawMapBorder: boolean = false;

    @property({ type: [JsonAsset] , group: 'LevelData' })
    public levelJsonAssets: JsonAsset[] = [];

    @property({ type: CCInteger, group: 'LevelData' })
    public tutQueueIndex: number;

    // Where a bullet goes after it has taken its cube out: it climbs over the map and flies to
    // this node. Leave it empty to have bullets just keep going straight out of the map instead.
    @property({ type: Node, group: 'Bullet' })
    public bulletExitTarget: Node = null;

    @property(BulletPooling) public bulletPool: BulletPooling;
    @property(BulletPooling) public particlePooling: BulletPooling;


    @property(AudioClip) public breakBlockBreak: AudioClip;
    @property(AudioClip) public shootOutClip: AudioClip;

    private _shooterCount : number = 0;

    /**
     * World-space size of the bound box: the collider's authored size scaled by its node's world
     * scale. Recomputed on read so editing the collider in the editor takes effect immediately.
     * Assumes the bound node is axis-aligned - a rotated box would need its extents projected
     * onto the world axes, and the level is authored square to the world anyway.
     */
    public get BoundsSize(): Vec3
    {
        if (!this.levelBoundBox) return this._boundsSize.set(0, 0, 0);

        const worldScale = this.levelBoundBox.node.worldScale;
        const size = this.levelBoundBox.size;
        return this._boundsSize.set(
            Math.abs(size.x * worldScale.x),
            Math.abs(size.y * worldScale.y),
            Math.abs(size.z * worldScale.z),
        );
    }

    /** World-space center of the bound box (its local `center` offset put through the node's world matrix). */
    public get BoundsCenter(): Vec3
    {
        if (!this.levelBoundBox) return this._boundsCenter.set(0, 0, 0);

        Vec3.transformMat4(this._boundsCenter, this.levelBoundBox.center, this.levelBoundBox.node.worldMatrix);
        return this._boundsCenter;
    }

    public get WidthMap(): number
    {
        return this.BoundsSize.x;
    }

    /** Vertical extent. Y is up in the 3D level, so this is no longer the Z span it used to be. */
    public get HeightMap(): number
    {
        return this.BoundsSize.y;
    }

    public get DepthMap(): number
    {
        return this.BoundsSize.z;
    }

    public get CenterMap(): Vec3
    {
        return this.BoundsCenter;
    }

    private _debugBoundsAABB: geometry.AABB = new geometry.AABB();

    @property({ type: ColorQueueControllers, group: 'Controllers' })
    protected colorQueueControllers: ColorQueueControllers = null;

    @property({ type: Conveyor, group: 'Controllers' })
    protected conveyor: Conveyor = null;

    // Remaining hits to clear the level (a cube with health N counts as N).
    private _cubeHitCount: number = 0;
    private _totalCubeHitCount: number = 0;

    private _shooterMapByID: Map<number, IShooterItem> = new Map<number, ShooterItem>();

    @property(AudioClip) private hitSound: AudioClip = null;

    private _is25Completed: boolean = false;
    private _is50Completed: boolean = false;
    private _is75Completed: boolean = false;

    @property({ type: CCInteger, group: 'LevelData' })
    private levelIndex: number = 0;

    protected _debugDrawSpline(): void
    {
        if (!this.cameraMain || !EDITOR || !PREVIEW || !this.debugDrawMapBorder) return;

        // The bound is a volume now, not a floor rectangle, so draw the whole box.
        const center = this.BoundsCenter;
        const size = this.BoundsSize;
        geometry.AABB.set(this._debugBoundsAABB, center.x, center.y, center.z, size.x * 0.5, size.y * 0.5, size.z * 0.5);

        this.cameraMain.camera.geometryRenderer?.addBoundingBox(this._debugBoundsAABB, Color.MAGENTA);
        this.cameraMain.camera.geometryRenderer?.addCircle(center, 0.1, Color.MAGENTA);
    }

    protected start(): void
    {
        if ((EDITOR || PREVIEW) && this.debugDrawMapBorder)
        {
            if (!this.cameraMain.camera.geometryRenderer)
                this.cameraMain.camera.initGeometryRenderer();
        }

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: EventKeyboard): void
    {
        if (event.keyCode === KeyCode.KEY_Q)
        {
            let bulletCount = 0;
            for (const [ id, shooter ] of this._shooterMapByID)
            {
                if (shooter)
                    bulletCount += shooter.getAmmoCount();
            }

            console.log(`Level Verification:
            Total Cube Hits Remaining: ${this._cubeHitCount}
            Total Bullets in Shooters: ${bulletCount}
            `);
        }
    }

    protected onDestroy(): void
    {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    public spawnLevel(): void
    {
        this._isFinished = false;
        this.conveyor.init();

        var textJson = JSON.stringify(this.levelJsonAssets[this.levelIndex].json);
        this.levelData = new LevelData3D(textJson);

        if (!this.levelGrid3D)
        {
            console.error('[LevelController] levelGrid3D is not assigned - no cube map will be spawned.');
        }
        else
        {
            // Scale first, spawn second: LevelGrid3D sizes its occlusion boxes against the
            // holder's world scale while spawning, so the fit has to already be applied.
            this.fitGridToMapBorder();
            // Hand over the already-parsed data so the JSON is only read once per level.
            this.levelGrid3D.spawnLevel(this.levelData);
        }

        this.colorQueueControllers.init(this.levelData.getShootersByLine(), this);

        this._cubeHitCount = this.countTotalCubeHits();
        this._totalCubeHitCount = this._cubeHitCount;

        this.linkShooters();

        this._is25Completed = false;
        this._is50Completed = false;
        this._is75Completed = false;

        if (PREVIEW || EDITOR)
        {
            this.logAllColorIDs();
        }
    }

    private _cubeMapSize: Vec3 = new Vec3();

    /**
     * Centers the cube map inside the bound box and uniformly scales it to fit, in the spirit of
     * the old 2D fit: one scale factor, the smallest of the per-axis ratios, so the level keeps
     * its proportions and cannot spill outside the bound on any axis.
     *
     * Unlike the 2D version this is a true 3D fit - the cube map stacks upward, so its Y span is
     * matched against the box's own Y extent rather than being folded into the XZ footprint.
     */
    private fitGridToMapBorder(): void
    {
        if (!this.levelBoundBox)
        {
            console.warn('[LevelController] levelBoundBox is not assigned - skipping the bound fit, the cube map keeps its authored transform.');
            return;
        }

        const holder = this.levelGrid3D.cubeBlockHolder;
        if (!holder)
        {
            console.warn('[LevelController] levelGrid3D.cubeBlockHolder is not assigned - skipping the bound fit.');
            return;
        }

        // Cube units, on a 1-unit lattice - the same units the tile local positions use.
        LevelGrid3D.computeCubeMapSize(this.levelData, this._cubeMapSize);

        // Read once: both getters rebuild into a shared scratch Vec3 on every access.
        const boundsSize = this.BoundsSize;
        const scaleX = this._cubeMapSize.x > 0 ? boundsSize.x / this._cubeMapSize.x : Infinity;
        const scaleY = this._cubeMapSize.y > 0 ? boundsSize.y / this._cubeMapSize.y : Infinity;
        const scaleZ = this._cubeMapSize.z > 0 ? boundsSize.z / this._cubeMapSize.z : Infinity;

        const mapScale = Math.min(scaleX, scaleY, scaleZ);
        if (!isFinite(mapScale) || mapScale <= 0)
        {
            console.warn(`[LevelController] Could not fit the cube map (${this._cubeMapSize}) inside the bound box (${boundsSize}) - leaving the holder transform untouched.`);
            return;
        }

        // LevelGrid3D already centers the cubes on the holder's origin, so placing the holder at
        // the box center is all that is needed to center the level inside the bound.
        holder.setWorldPosition(this.BoundsCenter);
        holder.setScale(mapScale, mapScale, mapScale);
    }

    /** A cube with health N needs N bullets, so the win counter tracks hits, not cube count. */
    private countTotalCubeHits(): number
    {
        let total = 0;
        for (const cube of this.levelData.cubes)
        {
            total += cube.health > 0 ? cube.health : 1;
        }
        return total;
    }

    private logAllColorIDs(): void
    {
        const colorSet = new Set<number>();
        for (const cube of this.levelData.cubes)
        {
            colorSet.add(cube.color);
        }
        const colorList = Array.from(colorSet).sort((a, b) => a - b);
        const colorNames = colorList.map(id => `${EColor[id] ?? 'Unknown'}(${id})`);
        console.log(`[LevelController] Color IDs on map (${colorList.length}): [${colorNames.join(', ')}]`);
    }

    protected lateUpdate(dt: number): void
    {
        // this._debugDrawSpline();
    }

    public getShooterEdge(x: number, z: number): EDirection
    {
        if (x <= this.maxX && x >= this.minX)
        {
            if (z <= this.minZ ) return EDirection.TOP;
            if (z >= this.maxZ ) return EDirection.BOTTOM;
        }
        if (z <= this.maxZ && z >= this.minZ)
        {
            if (x <= this.minX ) return EDirection.LEFT;
            if (x >= this.maxX ) return EDirection.RIGHT;
        }
        return EDirection.NONE;
    }

    public getSpline(): SplineSmooth
    {
        return this.conveyor;
    }

    private _screenPos = new Vec2();

    public clearLevel(): void
    {
        this.levelGrid3D?.clearLevel();
        this.colorQueueControllers.clearQueue();
        this.conveyor.clearConveyor();
        this._shooterMapByID.clear();
        this._shooterCount = 0;
    }

    private onTouchStart(event: EventTouch): void
    {
        if (this._isFinished) return;

        event.getLocation(this._screenPos);
        const ray = this.cameraMain.screenPointToRay(this._screenPos.x, this._screenPos.y);
        const isHit = PhysicsSystem.instance.raycastClosest(ray);
        if (!isHit) return;
        const hitResult = PhysicsSystem.instance.raycastClosestResult;
        const shooter = hitResult.collider.node.getComponent(ShooterItem);
        if (!shooter) return;

        if (this.conveyor.getNextEmpty() === null)
        {
            shooter.shakeCharacter(0.13, 0.1);
            EventDispatcher.dispatch(EventName.PlaySFX, this.hitSound, 0.5);
            return;
        }

        const canAdd = shooter.onTouchShooter(this.conveyor.getRemaniningSlotCount())
        if (canAdd)
        {
            if (this.isFinalStepSureWin())
            {
                EventDispatcher.dispatch(EventName.SureWinFinalStep);
            }
        }
        else
        {
            shooter.shakeCharacter(0.13, 0.1);
            EventDispatcher.dispatch(EventName.PlaySFX, this.hitSound, 0.5);
        }

    }

    public getCacheSlotController(): ICacheSlotController
    {
        return null
    }

    lose(): void
    {
        if (this._isFinished) return;
        this._isFinished = true;
        EventDispatcher.dispatch(EventName.EndGame, false);
    }

    checkWinCondition(): void
    {
        if (this._isFinished) return;
        this._cubeHitCount--;
        this.trackLevelProgress();
        if (this._cubeHitCount <= 0)
        {
            this._isFinished = true;
            this.levelIndex++;
            this.scheduleOnce(() => {
                EventDispatcher.dispatch(EventName.EndGame, true, this.levelIndex >= this.levelJsonAssets.length);
            }, 0.5);
        }
    }

    public getRemainCount(): number
    {
        return this.colorQueueControllers.getRemainInQueueCount();
    }

    public addToShooterMap(id: number, shooter: IShooterItem): void
    {
        this._shooterMapByID.set(id, shooter);
    }

    /**
     * Chains shooters that share a non-zero connectionGroup. The 3D level data has no explicit
     * connection list like the 2D schema did - the grouping is carried on each shooter - so the
     * chains are rebuilt here, ordered by (line, index) the same way the queues spawn them.
     */
    public linkShooters(): void
    {
        const groups = new Map<number, ShooterSpawnData3D[]>();
        for (const shooter of this.levelData.shooters)
        {
            if (shooter.connectionGroup === 0) continue;
            const group = groups.get(shooter.connectionGroup);
            if (group) group.push(shooter);
            else groups.set(shooter.connectionGroup, [ shooter ]);
        }

        groups.forEach(group =>
        {
            if (group.length <= 1) return;
            group.sort((a, b) => (a.line - b.line) || (a.index - b.index));

            const firstChainShooter = this._shooterMapByID.get(group[0].uid);
            for (let i = 0; i < group.length; i++)
            {
                const mainShooter = this._shooterMapByID.get(group[i].uid);
                if (!mainShooter) continue;
                const leftShooter = i > 0 ? this._shooterMapByID.get(group[i - 1].uid) : null;
                const rightShooter = i < group.length - 1 ? this._shooterMapByID.get(group[i + 1].uid) : null;
                mainShooter.setLinkedShooters(leftShooter, rightShooter, firstChainShooter);
            }
        });
    }

    public addShooterCount(): void
    {
        this._shooterCount += 1;
    }

    public removeShooterCount(): void
    {
        this._shooterCount -= 1;
    }

    public getShooterCount(): number
    {
        return this._shooterCount;
    }

    public isFinalStepSureWin(): boolean
    {
        return this.getShooterCount() <= this.conveyor.floaters.length;
    }


    public getBestFloaterSlot(): Floater
    {
        return this.conveyor.getNextEmpty();
    }

    public doUpdate(dt: number): void
    {
        this.colorQueueControllers.doUpdate(dt);
    }

    public dolateUpdate(dt: number): void
    {
        this.levelGrid3D.dolateUpdate(dt);
    }

    public trackLevelProgress(): void
    {
        const progress = (this._totalCubeHitCount - this._cubeHitCount) / this._totalCubeHitCount * 100;
        if (!this._is25Completed && progress >= 25)
        {
            this._is25Completed = true;
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_25);
        }
        if (!this._is50Completed && progress >= 50)
        {
            this._is50Completed = true;
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_50);
        }
        if (!this._is75Completed && progress >= 75)
        {
            this._is75Completed = true;
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_75);
        }
    }

    public scaleLevel(): void
    {
        // this.levelScaler.scaleToFitScreen();
        // this.colorQueueControllers.node.setWorldPosition(this.levelScaler.lowerPoint.worldPosition);
    }

    public getResetProgress(): number
    {
        return this.conveyor.resetProgress;
    }

    public getTutorialPosition(): Vec3 {
        return this.colorQueueControllers.getQueueTopPosition(this.tutQueueIndex);
    }

    //#region 3D shooting

    // Reused by grabCubeWithBullet(), which runs once per cube taken.
    private readonly _cubeGrabScale = new Vec3();
    private readonly _cubeGrabDir = new Vec3();

    /** The cube this shooter color should hit next, or null when none is reachable/visible. */
    public findTargetTile(colorID: number): IGridTile3D | null
    {
        return this.levelGrid3D ? this.levelGrid3D.findTargetTile(colorID) : null;
    }

    /**
     * Flies one bullet from `startPos` into `tile`, takes the cube out, then sends the bullet up
     * over the map and on to `bulletExitTarget`.
     *
     * The beats are: arc across the open air to the corridor mouth, straight down the corridor to
     * the cube, settle on its face and hold, heave it out, then haul it away over the map. Each
     * hands over to the next in its own callback, and BulletItem is told which beat it is in so it
     * can pose the bee accordingly - nose-first on the way in, gripping the face on the landing,
     * hanging under gravity once it is carrying.
     *
     * The flight has two halves, and the split is entirely about the map rotating:
     *
     * 1. While it is in or near the pile the bullet is PARENTED TO cubeBlockHolder, so it simply
     *    rides the level: it inherits the rotation for free, and the corridor - which is authored
     *    in the holder's own space - stays a corridor of empty cells however far the map has spun
     *    since the shot. Driving world positions instead would need the path re-derived every
     *    frame, and a world-space snapshot would be stale the instant the map moved and would cut
     *    straight through the cubes beside the target. The visible cost is that the muzzle-to-mouth
     *    leg curves along with the map, which reads as the level carrying the bullet.
     * 2. At the corridor mouth the bullet is out of the grid, so it is handed back to the pool's
     *    node (keeping its world transform, so it neither jumps nor keeps spinning) and the rest
     *    is flown in world space: up above the map's bounding sphere, then across to the target
     *    node, whose position is re-read every frame so a moving node is still hit. Staying
     *    outside the bounding sphere is rotation-proof - a sphere looks the same from every angle,
     *    so no amount of spin can swing a cube into that route.
     */
    public shootBulletAtTile(tile: IGridTile3D, startPos: Vec3): boolean
    {
        if (!this.levelGrid3D || !tile || !this.bulletPool) return false;

        const corridor = this.levelGrid3D.buildBulletPath(tile);
        if (!corridor) return false;

        this.levelGrid3D.reserveTile(tile);

        const bullet = this.bulletPool.getBullet();
        // Pooled: whatever the last shot left it holding, it leaves this muzzle empty-handed.
        const bulletItem = bullet.getComponent(BulletItem);
        bulletItem?.beginApproach();
        // The cell it is going to land on, in the holder's own space so it stays right as the map
        // turns: the bee weaves across the open air and unwinds onto the line as it closes on it.
        bulletItem?.setSwayTarget(this.levelGrid3D.cubeBlockHolder, corridor[0]);
        bullet.setWorldPosition(startPos);
        // keepWorldTransform, so parenting neither teleports the bullet nor shrinks it into the
        // holder's fit scale.
        bullet.setParent(this.levelGrid3D.cubeBlockHolder, true);

        // Holder-local units scale into world units by the holder's fit scale, so travel time is
        // measured in world units and the bullet keeps one speed across every leg.
        const cellWorldSize = this.levelGrid3D.getCellWorldSize();

        // The approach is two legs, because only one of them is free to wander: the open air
        // between muzzle and corridor mouth, which the bee arcs and weaves across, and then the
        // corridor itself, which is a straight line between standing cubes and has to stay one.
        const mouth = corridor[corridor.length - 1];
        const flyIn: Vec3[] = [];
        for (let i = corridor.length - 1; i >= 0; i--) flyIn.push(corridor[i]);

        this.flyBulletAlongArc(bullet, bullet.position.clone(), mouth, cellWorldSize, () =>
        {
            // Into the pile: the corridor gets flown straight however long it is, so a weave that
            // has not finished unwinding by the mouth finishes here instead of inside the cubes.
            bulletItem?.holdSwayStraight();

            this.flyBulletStraight(bullet, flyIn, cellWorldSize, () =>
            {
                this.landBulletOnFace(bullet, corridor);

                // Hold on the face for a beat before heaving. A tween rather than a scheduler so
                // it lives and dies with the rest of the flight.
                tween(bullet)
                    .delay(LAND_HOVER_DURATION)
                    .call(() =>
                    {
                        if (!bullet.isValid) return;

                        this.levelGrid3D.releaseTile(tile);

                        // A cube with health N takes N bullets - only the last one clears the
                        // cell, which is also what the win counter counts (one tick per hit, not
                        // per cube).
                        const health = tile.getHealth();
                        if (health > 1)
                        {
                            tile.setCubeData(tile.getColorID(), health - 1);
                        }
                        else
                        {
                            // Grab first, remove second, both in this frame: the stand-in has to
                            // be fitted to the cube while the tile still describes it, and has to
                            // appear in the same rebuild that drops it from the mesh so there is
                            // no blink.
                            this.grabCubeWithBullet(bullet, tile);
                            this.levelGrid3D.removeCube(tile.getCoordX(), tile.getCoordY(), tile.getCoordZ());
                        }
                        this.checkWinCondition();
                        EventDispatcher.dispatch(EventName.PlaySFX, this.breakBlockBreak);

                        this.flyBulletOut(bullet, corridor, cellWorldSize);
                    })
                    .start();
            });
        });

        return true;
    }

    /**
     * Flies the bullet between two holder-local points the way a bee actually crosses open air: an
     * arc that lifts off the straight line. Only ever used outside the pile - inside it the corridor
     * is the one line that is guaranteed clear of cubes, and that leg is flown straight by
     * flyBulletStraight().
     *
     * The wander across that arc is not here: BulletItem lays it over whatever path this writes, so
     * it is one weave with one set of knobs, and it can straighten onto the cell being landed on
     * (which spans this leg and the corridor leg both) rather than onto the end of this one.
     */
    private flyBulletAlongArc(bullet: Node, fromLocal: Vec3, toLocal: Vec3, cellWorldSize: number, onArrived: () => void): void
    {
        // Bend the line upwards, in world terms - the map is turning, so its own up is not up.
        const up = this.levelGrid3D.worldDirectionToLocal(new Vec3(), Vec3.UP);
        const span = Vec3.distance(fromLocal, toLocal);
        const control = new Vec3(
            (fromLocal.x + toLocal.x) * 0.5 + up.x * span * ARC_HEIGHT_RATIO,
            (fromLocal.y + toLocal.y) * 0.5 + up.y * span * ARC_HEIGHT_RATIO,
            (fromLocal.z + toLocal.z) * 0.5 + up.z * span * ARC_HEIGHT_RATIO,
        );

        const pos = new Vec3();
        const arcObj = { t: 0 };
        tween(arcObj)
            .to(Math.max((span * cellWorldSize) / BULLET_SPEED, 0.01), { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    quadraticBezier(pos, fromLocal, control, toLocal, arcObj.t);
                    bullet.setPosition(pos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;
                    onArrived();
                }
            })
            .start();
    }

    /** Straight-line run along a holder-local polyline - used for the legs inside the pile. */
    private flyBulletStraight(bullet: Node, path: Vec3[], cellWorldSize: number, onArrived: () => void): void
    {
        const localPos = new Vec3();
        const pathObj = { t: 0 };
        tween(pathObj)
            .to(LevelController.pathTravelTime(path, cellWorldSize), { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    lerpMultiplePoints(localPos, path, pathObj.t);
                    bullet.setPosition(localPos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;
                    onArrived();
                }
            })
            .start();
    }

    /**
     * Settles the bee onto the face the cube will come out of - the corridor's first step is that
     * direction, and the map's cube size is what it has to stand off by. Nothing is taken yet: the
     * cube is still in the wall for the hover that follows.
     */
    private landBulletOnFace(bullet: Node, corridor: Vec3[]): void
    {
        const bulletItem = bullet.getComponent(BulletItem);
        if (!bulletItem) return;

        const nextCell = corridor.length > 1 ? corridor[1] : corridor[0];
        this._cubeGrabDir.set(nextCell.x - corridor[0].x, nextCell.y - corridor[0].y, nextCell.z - corridor[0].z);
        this.levelGrid3D.localDirectionToWorld(this._cubeGrabDir, this._cubeGrabDir);

        this.levelGrid3D.getCubeWorldScale(this._cubeGrabScale);

        bulletItem.landOnFace(this._cubeGrabDir, this._cubeGrabScale);
    }

    /**
     * Hands the cube at `tile` to the bullet: its own stand-in is switched on and coloured like the
     * one the map is about to lose (the landing already sized it). The cube is a child of the
     * bullet, so from here it simply comes along.
     */
    private grabCubeWithBullet(bullet: Node, tile: IGridTile3D): void
    {
        const bulletItem = bullet.getComponent(BulletItem);
        if (!bulletItem) return;

        const colorBytes = this.levelGrid3D.getCubeColorBytes(tile.getColorID());

        bulletItem.grabCube(
            colorBytes ? colorBytes.color : null,
            colorBytes ? colorBytes.shadow : null,
        );
    }

    /**
     * Second half of a bullet's flight: a short sharp pop straight out of the cell - the cube
     * coming unplugged - then back out along the corridor (still parented to the map, so it keeps
     * tracking the rotation), then off the map and up out of its bounding sphere and across to
     * `bulletExitTarget` in world space, re-aimed every frame. Without a target node assigned the
     * bullet just keeps climbing until it is well clear, then is recycled.
     */
    private flyBulletOut(bullet: Node, corridor: Vec3[], cellWorldSize: number): void
    {
        const localPos = new Vec3();

        // Pop: overshoot a short way along the first corridor step, so the cube visibly snaps free
        // before the bee settles into carrying it. backOut gives it the recoil at the end.
        const popFrom = corridor[0];
        const nextCell = corridor.length > 1 ? corridor[1] : corridor[0];
        const popDir = new Vec3(nextCell.x - popFrom.x, nextCell.y - popFrom.y, nextCell.z - popFrom.z);
        if (popDir.lengthSqr() > 1e-8) popDir.normalize();
        const popTo = new Vec3(
            popFrom.x + popDir.x * POP_DISTANCE_CELLS,
            popFrom.y + popDir.y * POP_DISTANCE_CELLS,
            popFrom.z + popDir.z * POP_DISTANCE_CELLS,
        );

        // What is left of the corridor once the pop has covered its first stretch.
        const corridorAfterPop: Vec3[] = [ popTo ];
        for (let i = 1; i < corridor.length; i++) corridorAfterPop.push(corridor[i]);

        const popObj = { t: 0 };
        tween(popObj)
            .to(POP_DURATION, { t: 1 }, {
                easing: easing.backOut,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    Vec3.lerp(localPos, popFrom, popTo, popObj.t);
                    bullet.setPosition(localPos);
                }
            })
            .call(() =>
            {
                if (!bullet.isValid) return;
                // Cube is free of the wall: gravity takes over the layout from here.
                bullet.getComponent(BulletItem)?.beginCarry();
                this.flyBulletAlongCorridor(bullet, corridorAfterPop, cellWorldSize);
            })
            .start();
    }

    /** Rides the rest of the corridor out of the pile, then hands over to the world-space leg. */
    private flyBulletAlongCorridor(bullet: Node, corridor: Vec3[], cellWorldSize: number): void
    {
        if (!bullet.isValid) return;

        // Dead straight down the corridor: it is the one line through the pile guaranteed clear of
        // cubes, and a cube in hand wandering off it would go through its neighbours. The weave is
        // taken back up by the exit leg, in open air.
        bullet.getComponent(BulletItem)?.holdSwayStraight();

        const localPos = new Vec3();

        const corridorObj = { t: 0 };
        tween(corridorObj)
            .to(LevelController.pathTravelTime(corridor, cellWorldSize), { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    lerpMultiplePoints(localPos, corridor, corridorObj.t);
                    bullet.setPosition(localPos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;

                    // Off the map's back now: hand the bullet back to the pool's node, keeping
                    // where it is, so it stops spinning with the level. The carried cube is a
                    // child of the bullet, so it comes along and stops spinning with it.
                    bullet.setParent(this.bulletPool.node, true);
                    this.flyBulletToExitTarget(bullet);
                }
            })
            .start();
    }

    /**
     * Last leg, in world space and starting from wherever the bullet already is (which is always
     * outside the grid by now): one arch that climbs above the map's bounding sphere and comes
     * down onto `bulletExitTarget`, re-aimed every frame so a moving node is still hit.
     *
     * The climb is a Bezier control point rather than a waypoint, which is what makes it an arch
     * instead of a corner - a bee does not fly up, stop, and turn. A curve only leans about
     * halfway towards its control point, so the control is set at twice the height that has to be
     * cleared and the curve peaks at the height itself.
     *
     * A bounding SPHERE, not the box: the map keeps turning, and only a sphere is the same size
     * from every angle, so a route outside it can never be reached by a rotated-in cube. With no
     * target node assigned the bullet just climbs clear and is recycled there.
     */
    private flyBulletToExitTarget(bullet: Node): void
    {
        const center = this.BoundsCenter;
        const span = this.BoundsSize;
        const radius = Math.hypot(span.x, span.y, span.z) * 0.5 + EXIT_CLEARANCE;
        const cruiseY = center.y + radius;

        const climbFrom = bullet.worldPosition.clone();
        const peakY = Math.max(cruiseY, climbFrom.y);
        const control = new Vec3(climbFrom.x, climbFrom.y + (peakY - climbFrom.y) * 2, climbFrom.z);
        // Nowhere to fly to: arch up and off, and let the recycle happen up there.
        const fallbackEnd = new Vec3(climbFrom.x, peakY, climbFrom.z);

        const target = this.bulletExitTarget;

        // Straighten the weave out onto the exit the same way it straightens onto a face. A moving
        // target is handed over as its own node so the bee measures against where it is now, not
        // where it was when the leg started.
        const bulletItem = bullet.getComponent(BulletItem);
        if (target) bulletItem?.setSwayTarget(target, Vec3.ZERO);
        else bulletItem?.setSwayTarget(null, fallbackEnd);

        const flyPos = new Vec3();
        const exitObj = { t: 0 };

        const climbDistance = peakY - climbFrom.y;
        const crossDistance = target ? Vec3.distance(control, target.worldPosition) : radius;
        const duration = Math.max((climbDistance + crossDistance) / BULLET_SPEED, 0.01);

        tween(exitObj)
            .to(duration, { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    // Re-read the node every frame: it may be moving, and the arch keeps the
                    // bullet above the map the whole way across.
                    quadraticBezier(flyPos, climbFrom, control, target ? target.worldPosition : fallbackEnd, exitObj.t);
                    bullet.setWorldPosition(flyPos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;
                    // Drop the cube before parking the bullet, or it would still be in hand the
                    // next time this one is fired.
                    bullet.getComponent(BulletItem)?.releaseCube();
                    this.bulletPool.returnBullet(bullet);
                }
            })
            .start();
    }

    /**
     * Seconds a bullet needs to walk `path` at BULLET_SPEED, so speed stays constant leg to leg.
     * `unitScale` converts the path's units into world units - 1 for a world-space path, the
     * holder's cell size for a local-space one.
     */
    private static pathTravelTime(path: Vec3[], unitScale: number = 1): number
    {
        let length = 0;
        for (let i = 1; i < path.length; i++) length += Vec3.distance(path[i - 1], path[i]);
        return Math.max((length * unitScale) / BULLET_SPEED, 0.01);
    }

    //#endregion

    //#region 2D grid stubs
    // The 2D pixel grid used to live here; it now lives in LevelGrid3D as a 3D cube grid, which
    // ShooterItem/PixelBlock have not been ported to yet. These keep ILevelController satisfied
    // (so those two still compile) and are deliberately inert - none of them touch level state.
    // Delete them together with their call sites once the shooting flow moves onto IGridTile3D.

    public getTileAtCoord(x: number, z: number): IGridTile | null
    {
        return null;
    }

    public getBlockAtCoord(x: number, z: number): PixelBlock | null
    {
        return null;
    }

    public getLevelWidth(): number
    {
        return 0;
    }

    public getLevelHeight(): number
    {
        return 0;
    }

    public dropColumn(x: number): void
    {
    }

    public setBottomPixel(block: IPixelBlock, colIndex: number, rowIndex: number): void
    {
    }

    public getSurroundingPixels(grid: IGridTile, pixel: IPixelBlock, out: IPixelBlock[]): void
    {
        out.length = 0;
    }

    public findTargetPixels(colorID: number, out: Map<IPixelBlock, IGridTile[]>, max: number): void
    {
        out.clear();
    }

    public moveBulletByPathToTarget(block: IPixelBlock, path: IGridTile[], startPos: Vec3): void
    {
    }

    // Lose detection read the 2D edge-reachability of every remaining color. The 3D equivalent
    // (LevelGrid3D.findTargetTile returning null for every queued color) is not wired up yet, so
    // this never declares a loss rather than declaring a false one.
    public checkLose(): void
    {
    }

    //#endregion
}
