import { _decorator, AudioClip, BoxCollider, Camera, CCBoolean, CCInteger, Color, Component, easing, EventKeyboard, EventTouch, geometry, Input, input, JsonAsset, KeyCode, Node, PhysicsSystem, Quat, tween, Vec2, Vec3 } from 'cc';
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
import { cubicBezier, lerpMultiplePoints } from '../../utils/MathUtils';
import { BulletItem } from '../flows/Bullet/BulletItem';
const { ccclass, property } = _decorator;

// World units per second for the legs on the way OUT - back down the corridor and off to the exit.
const BULLET_SPEED = 12;

// World units per second for the way IN, muzzle to corridor mouth. Slower than the way out, and
// separate from it on purpose: the flight in is the one the player is reading - it is where the bee
// picks its cube, weaves, hovers and commits - while the flight out is a bee leaving with its prize
// and wants to be brisk. 10 against 16 makes the approach 1.6x longer than it was.
//
// Nothing downstream is timed off this. The weave, the resize and the grip reach are all paced by
// distance still to fly, so changing the speed stretches them with it instead of leaving them to
// finish early and wait.
// Cocos' board is much more compact on screen than the Unity board. At 10 world units/s it reads
// as a projectile even though the nominal unit value is lower, so this is the visual-speed match:
// enough time to see the shared launch, the sideways search, and the final commitment.
const APPROACH_SPEED = 4.5;

// Unity turns from the filtered display velocity. Its 720-degree cap is rarely reached; Cocos
// reads raw tween displacement, so use this equivalent cap or every lane-change snaps instantly.
const UNITY_APPROACH_TURN_SPEED = 300;

// How far outside the map's own bounds a bullet's fly-out route is kept, so it never grazes a
// cube that is still standing.
const EXIT_CLEARANCE = 1;

// HOW HIGH THE WAY OUT GOES. Two separate heights, both as a fraction of the map's bounding radius
// so they scale with the level instead of needing a re-tune per size. Lower either one to flatten
// that half of the exit.
//
// The arch on the way ACROSS to the exit point, measured above the map's own centre. At 1 the route
// clears the bounding sphere outright, which is the conservative figure - the sphere is the map's
// half-DIAGONAL, so it stands well proud of the pile itself and there is real room below 1 before
// anything is grazed. Below about 0.6 expect a bee crossing over a full map to clip the corners.
const EXIT_ARCH_HEIGHT_RATIO = .39;

// The climb UP off the exit point, measured above the point itself - purely how far the bee goes
// before it is recycled, so this one only has to be far enough to be out of frame. Nothing can be
// hit up there, so it is free to be as low as still looks like leaving.
const EXIT_CLIMB_HEIGHT_RATIO = 2;

// The hook at the exit point: how long the curve's handles are there, as a fraction of the
// horizontal distance flown to get to it. This is the ONLY thing that decides how tight the turn
// from flying across to flying up is - bigger sweeps wider through the exit, smaller snaps round it.
// The same length is used either side of the point, which is what keeps the two halves reading as
// one move rather than two curves that happen to touch.
const EXIT_HOOK_RATIO = 0.135;

// Return beats copied from Unity's collector state machine: pause to turn, a small backwards
// wind-up, then a curved but always forward-moving run into the Cocos hive/exit target.
const RETURN_TURN_DURATION = 0.18;
const RETURN_WINDUP_DURATION = 0.12;
const RETURN_WINDUP_DISTANCE = 0.7;
const RETURN_SPEED = 5.5;
const RETURN_LANE_JITTER = 0.35;
const RETURN_ENTRY_BELOW_EXIT = 0.55;

// The beat the bee spends settled on the cube's face, gripping, before it heaves. The cube is
// still part of the wall for this - without the pause the grab reads as the bee passing through.
const LAND_HOVER_DURATION = 0.2;

// The plug-out: how far (in grid cells) and how fast the bullet yanks the cube straight out of
// its cell before settling into carrying it down the corridor.
//
// Slower than it first was (0.14s), so the heave is something the eye can follow rather than a
// single-frame jump - at 0.14s the whole 0.9-cell shove was over in 8 frames.
const POP_DISTANCE_CELLS = 0.9;
const POP_DURATION = 0.26;

// Unity's collector departure profile. The bee first leaves in a shared direction, then fans out
// into discrete lanes, and finally converges exactly onto the corridor mouth. These are copied from
// GameConfig's current collector values so the Cocos swarm reads the same as the Unity one.
const UNITY_LAUNCH_PHASE_RATIO = 0.15;
const UNITY_SPREAD_PHASE_RATIO = 0.65;
const UNITY_LAUNCH_CONE_ANGLE_DEGREES = 18;
const UNITY_LAUNCH_DISTANCE_RATIO = 0.12;
const UNITY_SPREAD_DISTANCE_RATIO = 0.35;
const UNITY_SPREAD_JITTER = 0.35;
const UNITY_SPREAD_GROUP_COUNT = 3;
const UNITY_SPREAD_ANGLE_MIN_DEGREES = 15;
const UNITY_SPREAD_ANGLE_MAX_DEGREES = 85;

// The beat at the corridor mouth, before the bee commits inward: it holds off the pile and circles
// once rather than turning straight down the corridor the frame it arrives. This is what reads as
// the bee choosing its cube - a flight that goes muzzle-to-face in one continuous move reads as a
// projectile however much the path itself wanders.
//
// Safe to hover here because the mouth is one cell OUTSIDE the grid: no cube can occupy the space
// being circled, whatever the map does meanwhile.
const GATE_HOVER_DURATION = 0.23;
const GATE_HOVER_RADIUS_CELLS = 0.5;
// The final world-space hand-off to a rotating corridor. Never snap across this boundary: during a
// drag the corridor mouth can move several units between rendered frames.
const MOUTH_CATCHUP_STEP_SECONDS = 1 / 60;
const MOUTH_CATCHUP_EPSILON = 0.02;
const MOUTH_TARGET_SMOOTH_RATE = 14;
// Well under one turn - a sweep across the mouth and back onto the line, not an orbit.
//
// KEEP TURNS/DURATION UNDER ABOUT 2 REV/S. This was 1.35 turns over 0.22s = 6.1 rev/s, which is 37
// degrees of orbit per frame at 60fps: the bee did not read as hovering, it read as vibrating. More
// turns is not more hovering past that point, it is buzz. Current 0.39 over 0.23s = 1.7 rev/s, about
// 10 degrees per frame.
const GATE_HOVER_TURNS = 0.39;

// How far out from its grip the bee commits from - the length of the dive, in grid cells.
//
// THE DIVE IS A FIXED DISTANCE, which is what makes it read the same on every cube. Before this the
// dive ran the whole corridor, so its length was however deep the cube happened to sit: about half a
// cell for one on the surface, five or more for one at the bottom of a hollow. Pacing that by speed
// made the velocity uniform but the BEAT still lasted ten times longer on a deep cube.
//
// The corridor above the margin is a separate travel leg now (descendBulletToGate), so what varies
// with depth is a plain descent, and the part that carries the meaning - line up, commit, land - is
// identical every time.
//
// Kept small on purpose. The Unity build of this game anchors the same beat 1.5 world units from the
// block and notes that it has to stay short (1-2 units) or the commit stops reading as a dive and
// starts reading as a teleport. Their earlier version anchored it to the model's bounding sphere -
// which is this project's corridor mouth - and that is the exact defect being fixed here: on a shape
// with bounding radius 9.7 and a front face at 5, the bee waited 6 units out and crossed it all in
// one move.
const APPROACH_MARGIN_CELLS = 1.25;

// The dive onto the face: max(DIVE_MIN_DURATION, distance / DIVE_SPEED), cubicOut.
//
// With a fixed margin the distance is constant, so both terms agree and the dive is one length. They
// still both earn their place: the speed term keeps a big level (large cellWorldSize) from crossing
// the margin faster than the bee flies, and the floor covers the shallow-corridor case where the
// margin gets clamped down to whatever room there is - two frames of dive would otherwise vanish on
// exactly the surface cubes the player picks most.
const DIVE_SPEED = 8;
const DIVE_MIN_DURATION = 0.18;

// The shortest and longest a decided level waits before its EndGame goes out - see requestEndGame().
const END_GAME_MIN_DELAY = 0.5;
const END_GAME_MAX_WAIT = 4;

@ccclass('LevelController')
export class LevelController extends Component implements ILevelController
{

    private _isFinished: boolean = false;

    // A verdict reached but not yet dispatched, and how long it has been held - see requestEndGame().
    private _endGamePending: boolean = false;
    private _endGameIsWin: boolean = false;
    private _endGameAllLevelsCleared: boolean = false;
    private _endGameWait: number = 0;

    // Reused by the deadlock test - see checkLose().
    private readonly _conveyorColors = new Set<number>();
    private readonly _reachableColors = new Set<number>();

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
        this._endGamePending = false;
        this._endGameWait = 0;
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
        this.requestEndGame(false);
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
            this.requestEndGame(true, this.levelIndex >= this.levelJsonAssets.length);
        }
    }

    /**
     * Parks a decided level's verdict until the board has settled, instead of dispatching EndGame on
     * the spot.
     *
     * Both endings are decided while bees are still in the air: a win is called the instant the last
     * cube is taken, with the bee that took it still hauling it out over the map, and a loss is
     * called by an idle shooter that may be sitting beside one flying home from an earlier shot.
     * Cutting to the end panel over that leaves bees frozen mid-flight on screen, and drops the cube
     * they were carrying out of the level without ever showing it delivered - so the dispatch waits
     * for the last bullet to be back in the pool (see updateEndGame).
     */
    private requestEndGame(isWin: boolean, allLevelsCleared: boolean = false): void
    {
        if (this._endGamePending) return;

        this._endGamePending = true;
        this._endGameIsWin = isWin;
        this._endGameAllLevelsCleared = allLevelsCleared;
        this._endGameWait = 0;
    }

    /**
     * Sends a parked verdict once the level has settled: at least END_GAME_MIN_DELAY has passed (the
     * beat the win used to get from its scheduleOnce, so the last cube's break is seen before the
     * panel), and every bee is home.
     */
    private updateEndGame(dt: number): void
    {
        if (!this._endGamePending) return;

        this._endGameWait += dt;
        if (this._endGameWait < END_GAME_MIN_DELAY) return;

        // The cap is a backstop, not a timing knob: it is only reached if a bee never reports home -
        // a killed tween, a node destroyed under it - and without it the run would sit on a decided
        // level with no end panel at all.
        if (this._endGameWait < END_GAME_MAX_WAIT && this.bulletPool?.hasInFlightBullets()) return;

        this._endGamePending = false;
        EventDispatcher.dispatch(EventName.EndGame, this._endGameIsWin, this._endGameAllLevelsCleared);
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
        this.levelGrid3D.updateVisibilities(dt);
        this.updateEndGame(dt);
    }

    public dolateUpdate(dt: number): void
    {
        this.levelGrid3D.doLateUpdate(dt);
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
    public shootBulletAtTile(tile: IGridTile3D, startPos: Vec3, colorBytes: Uint8Array, shadowBytes: Uint8Array): boolean
    {
        if (!this.levelGrid3D || !tile || !this.bulletPool) return false;

        const corridor = this.levelGrid3D.buildBulletPath(tile);
        if (!corridor)
        {
            // findTargetTile() only hands out tiles whose corridor is clear, using the very same
            // walk buildBulletPath() runs - so this branch means the two have drifted apart again.
            // Loud on purpose: silently returning false spends no ammo and takes no reservation, so
            // the shooter just re-picks this tile next cycle and spins on it indefinitely.
            if (tile.isReachable()) console.error('[LevelController] buildBulletPath() found no corridor for a tile findTargetTile() reported as reachable - the gate and the bullet path disagree.');
            return false;
        }

        this.levelGrid3D.reserveTile(tile);

        const bullet = this.bulletPool.getBullet();
        const bulletItem = bullet.getComponent(BulletItem);
        bulletItem?.setColor(colorBytes, shadowBytes);
        // BulletItem normally faces raw tween displacement at 720 deg/s. Unity filters that visual
        // displacement before facing, which produces a visibly more deliberate bee-like turn.
        if (bulletItem) bulletItem.travelTurnSpeed = UNITY_APPROACH_TURN_SPEED;
        // Handed the map's cube size up front, not just at the landing: the bee grows onto it across
        // the flight in, which is the one stretch long enough to hide the change.
        this.levelGrid3D.getCubeWorldScale(this._cubeGrabScale);
        bulletItem?.beginApproach(this._cubeGrabScale);
        bullet.setWorldPosition(startPos);
        // Keep the broad swarm leg outside cubeBlockHolder. Unity collectors are positioned in
        // world space, so rotating the board changes the target but does not spin the bee's whole
        // in-flight curve with it. We re-parent at the corridor mouth, where local space is needed
        // for the guaranteed-clear approach route.
        bullet.setParent(this.bulletPool.node, true);

        // Holder-local units scale into world units by the holder's fit scale, so travel time is
        // measured in world units and the bullet keeps one speed across every leg.
        const cellWorldSize = this.levelGrid3D.getCellWorldSize();

        // Where the bee actually comes to rest: out from the cube's centre along the face it grips,
        // NOT the cube's own cell. Aiming the run-in at the cell flies the bee inside the cube and
        // lets the landing pose yank it back out in one frame, at the moment it is biggest on screen.
        const attachPoint = this.attachPointFor(corridor, bulletItem, cellWorldSize);

        // The end of the whole way in, in the holder's own space so it stays right as the map turns.
        bulletItem?.setSwayTarget(this.levelGrid3D.cubeBlockHolder, attachPoint);

        // Four legs in, because each has a different job: the open air out to the corridor mouth,
        // free to bow and weave; the hover at the mouth, off the pile and outside it; the descent
        // down whatever corridor there is, a plain straight travel leg; then the commit, a fixed
        // APPROACH_MARGIN_CELLS onto the face.
        //
        // The descent and the commit are split rather than flown as one leg so that the beat carrying
        // the meaning is the same length on every cube - see APPROACH_MARGIN_CELLS. The corridor is
        // collinear (buildBulletPath walks a single face direction), so both are straight segments of
        // the same line and neither can leave it.
        const mouth = corridor[corridor.length - 1];
        const gate = this.commitPointFor(corridor, attachPoint);

        // Unity's launch/spread offset is the complete incoming trajectory, so do not stack the
        // older per-frame sine weave on top of it. The weave comes back for the carrying flight.
        bulletItem?.setApproachWeaveSuppressed(true);
        this.flyBulletAlongUnityDeparture(bullet, bullet.worldPosition.clone(), mouth, () =>
        {
            // All legs after the mouth are defined in holder-local cells. Keeping world transform
            // makes this hand-off invisible while pinning the corridor path to the rotating map.
            bullet.setParent(this.levelGrid3D.cubeBlockHolder, true);

            // Straighten up over the hover, and be done BY THE END OF IT: the corridor's clearance is
            // one cube wide, so the weave has to be gone before the bee is inside it, and the dive
            // that follows has no room to finish the job.
            //
            // The hover's own length is handed over rather than left to swaySettleSpeed, because a
            // rate cannot promise to finish by a deadline - and the rate serialised into the bullet
            // prefab left 0.047 units standing at the landing, which the landing snapped off.
            bulletItem?.holdSwayStraight(GATE_HOVER_DURATION);

            this.hoverBulletAtGate(bullet, corridor, () =>
            {
                // Cocos locks a target once it is reserved. Visibility is required when choosing
                // it, but rotating the grid afterwards must not make this bee wait at the gate:
                // that pause reads as a confused/stuck bee and differs from the Cocos gameplay.
                this.descendBulletToGate(bullet, mouth, gate, cellWorldSize, () =>
                {
                    this.diveBulletOntoFace(bullet, gate, attachPoint, cellWorldSize, () =>
                    {
                        this.gripAndHeave(bullet, tile, corridor, cellWorldSize);
                    });
                });
            });
        });

        return true;
    }

    /**
     * The beat at the cube: the bee settles onto the face, grips for a moment with the cube still
     * part of the wall, then takes it and heads back out.
     *
     * Its own method rather than the innermost of four nested callbacks - the flight is a chain of
     * legs and the pyramid made it hard to see which brace ended which beat.
     */
    private gripAndHeave(bullet: Node, tile: IGridTile3D, corridor: Vec3[], cellWorldSize: number): void
    {
        this.landBulletOnFace(bullet, corridor);

        // Hold on the face for a beat before heaving. A tween rather than a scheduler so it lives
        // and dies with the rest of the flight.
        tween(bullet)
            .delay(LAND_HOVER_DURATION)
            .call(() =>
            {
                if (!bullet.isValid) return;

                this.levelGrid3D.releaseTile(tile);

                // A cube with health N takes N bullets - only the last one clears the cell, which
                // is also what the win counter counts (one tick per hit, not per cube).
                const health = tile.getHealth();
                if (health > 1)
                {
                    tile.setCubeData(tile.getColorID(), health - 1);
                }
                else
                {
                    // Grab first, remove second, both in this frame: the stand-in has to be fitted
                    // to the cube while the tile still describes it, and has to appear in the same
                    // rebuild that drops it from the mesh so there is no blink.
                    this.grabCubeWithBullet(bullet, tile);
                    this.levelGrid3D.removeCube(tile.getCoordX(), tile.getCoordY(), tile.getCoordZ());
                }
                this.checkWinCondition();
                EventDispatcher.dispatch(EventName.PlaySFX, this.breakBlockBreak);

                this.flyBulletOut(bullet, corridor, cellWorldSize);
            })
            .start();
    }

    /**
     * Unity's three-phase collector path in world space. It deliberately stays outside the rotating
     * grid holder until the corridor mouth: its broad spread looks busy in open air without spinning
     * with the board, while the corridor itself still uses its guaranteed-clear local-space line.
     */
    private flyBulletAlongUnityDeparture(bullet: Node, fromWorld: Vec3, targetLocal: Vec3, onArrived: () => void): void
    {
        const targetWorld = new Vec3();
        Vec3.transformMat4(targetWorld, targetLocal, this.levelGrid3D.cubeBlockHolder.worldMatrix);
        const span = Vec3.distance(fromWorld, targetWorld);
        if (span <= 1e-5)
        {
            bullet.setWorldPosition(targetWorld);
            onArrived();
            return;
        }

        const forward = new Vec3();
        Vec3.subtract(forward, targetWorld, fromWorld);
        forward.normalize();

        // Unity rotates its lanes around world Y, not around the board's local up axis.
        const launchDirection = this.rotateAroundAxis(
            forward,
            Vec3.UP,
            (Math.random() * 2 - 1) * UNITY_LAUNCH_CONE_ANGLE_DEGREES * Math.PI / 180,
        );
        const departureDirection = this.unityDepartureDirection(forward, Vec3.UP);
        const spreadScale = Math.max(0.2, 1 + (Math.random() * 2 - 1) * UNITY_SPREAD_JITTER);
        const launchPeak = span * UNITY_LAUNCH_DISTANCE_RATIO * spreadScale;
        const spreadPeak = span * UNITY_SPREAD_DISTANCE_RATIO * spreadScale;

        const launchOffset = new Vec3();
        const spreadOffset = new Vec3();
        Vec3.multiplyScalar(launchOffset, launchDirection, launchPeak);
        Vec3.multiplyScalar(spreadOffset, departureDirection, spreadPeak);

        const pos = new Vec3();
        const offset = new Vec3();
        const flight = { t: 0 };
        tween(flight)
            .to(Math.max(span / APPROACH_SPEED, 0.01), { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;

                    // Re-read the mouth in world space while the board is rotating, matching
                    // Unity's continually updated target position instead of rotating the bee.
                    Vec3.transformMat4(targetWorld, targetLocal, this.levelGrid3D.cubeBlockHolder.worldMatrix);
                    Vec3.lerp(pos, fromWorld, targetWorld, flight.t);
                    this.unityDepartureOffset(offset, launchOffset, spreadOffset, flight.t);
                    Vec3.add(pos, pos, offset);
                    bullet.setWorldPosition(pos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;
                    // Do NOT snap to a mouth that may have moved while the player was dragging the
                    // board. Walking the last gap at flight speed prevents the visible teleport (and
                    // the apparent pass-through of nearby cubes) before the local corridor takes over.
                    this.catchUpToMovingMouth(bullet, targetLocal, onArrived);
                }
            })
            .start();
    }

    /** Smoothly closes the small, moving world-space gap before switching to corridor-local motion. */
    private catchUpToMovingMouth(bullet: Node, mouthLocal: Readonly<Vec3>, onArrived: () => void, smoothedMouth?: Vec3): void
    {
        if (!bullet.isValid) return;

        const liveMouth = new Vec3();
        Vec3.transformMat4(liveMouth, mouthLocal, this.levelGrid3D.cubeBlockHolder.worldMatrix);
        const target = smoothedMouth ?? liveMouth.clone();

        // Drag input moves the live mouth in sharp frame-sized steps. A critically damped-like
        // exponential filter gives the bee one continuous heading to turn towards instead of making
        // it correct left/right every mouse event. It still checks liveMouth for the final hand-off.
        const smoothing = 1 - Math.exp(-MOUTH_TARGET_SMOOTH_RATE * MOUTH_CATCHUP_STEP_SECONDS);
        Vec3.lerp(target, target, liveMouth, smoothing);

        const current = bullet.worldPosition;
        const delta = new Vec3(target.x - current.x, target.y - current.y, target.z - current.z);
        const distance = delta.length();
        const liveDistance = Vec3.distance(current, liveMouth);

        if (distance <= MOUTH_CATCHUP_EPSILON && liveDistance <= MOUTH_CATCHUP_EPSILON)
        {
            // This last correction is imperceptibly small and makes the ensuing local hover start
            // exactly on its corridor point.
            bullet.setWorldPosition(liveMouth);
            onArrived();
            return;
        }

        const step = Math.min(distance, APPROACH_SPEED * MOUTH_CATCHUP_STEP_SECONDS);
        delta.multiplyScalar(step / distance);
        bullet.setWorldPosition(current.x + delta.x, current.y + delta.y, current.z + delta.z);

        tween(bullet)
            .delay(MOUTH_CATCHUP_STEP_SECONDS)
            .call(() => this.catchUpToMovingMouth(bullet, mouthLocal, onArrived, target))
            .start();
    }

    /** Matches ContainerBoardLogic.ComputeDepartureDirection from the Unity project. */
    private unityDepartureDirection(forward: Readonly<Vec3>, axis: Readonly<Vec3>): Vec3
    {
        const minAngle = Math.min(UNITY_SPREAD_ANGLE_MIN_DEGREES, UNITY_SPREAD_ANGLE_MAX_DEGREES);
        const maxAngle = Math.max(UNITY_SPREAD_ANGLE_MIN_DEGREES, UNITY_SPREAD_ANGLE_MAX_DEGREES);
        let baseSide = Math.sign(forward.x);
        if (Math.abs(forward.x) < 0.01) baseSide = Math.random() < 0.5 ? -1 : 1;

        let angle: number;
        let side: number;
        if (UNITY_SPREAD_GROUP_COUNT > 1 && Math.random() >= 0.25)
        {
            const group = Math.floor(Math.random() * UNITY_SPREAD_GROUP_COUNT);
            const band = (maxAngle - minAngle) / UNITY_SPREAD_GROUP_COUNT;
            angle = minAngle + band * (group + 0.5) + (Math.random() * 0.9 - 0.45) * band;
            side = group % 2 === 0 ? baseSide : -baseSide;
        }
        else
        {
            angle = minAngle + Math.random() * (maxAngle - minAngle);
            side = Math.random() < 0.5 ? -baseSide : baseSide;
        }

        return this.rotateAroundAxis(forward, axis, side * angle * Math.PI / 180);
    }

    /** Same easing and phase boundaries as ContainerBoardController.GetDepartureOffset in Unity. */
    private unityDepartureOffset(out: Vec3, launchOffset: Readonly<Vec3>, spreadOffset: Readonly<Vec3>, progress: number): Vec3
    {
        if (progress < UNITY_LAUNCH_PHASE_RATIO)
        {
            const t = UNITY_LAUNCH_PHASE_RATIO > 0 ? progress / UNITY_LAUNCH_PHASE_RATIO : 1;
            const easeOutCubic = 1 - Math.pow(1 - t, 3);
            return Vec3.multiplyScalar(out, launchOffset, easeOutCubic);
        }

        if (progress < UNITY_SPREAD_PHASE_RATIO)
        {
            const span = UNITY_SPREAD_PHASE_RATIO - UNITY_LAUNCH_PHASE_RATIO;
            const t = span > 1e-4 ? (progress - UNITY_LAUNCH_PHASE_RATIO) / span : 1;
            const smoothStep = t * t * (3 - 2 * t);
            return Vec3.lerp(out, launchOffset, spreadOffset, smoothStep);
        }

        const remainingSpan = 1 - UNITY_SPREAD_PHASE_RATIO;
        const t = remainingSpan > 1e-4 ? Math.min(1, Math.max(0, (progress - UNITY_SPREAD_PHASE_RATIO) / remainingSpan)) : 1;
        const fade = 1 - t * t * (3 - 2 * t);
        return Vec3.multiplyScalar(out, spreadOffset, fade);
    }

    private rotateAroundAxis(vector: Readonly<Vec3>, axis: Readonly<Vec3>, radians: number): Vec3
    {
        const rotation = new Quat();
        const result = new Vec3();
        Quat.fromAxisAngle(rotation, axis, radians);
        Vec3.transformQuat(result, vector, rotation);
        return result.normalize();
    }

    /**
     * Where the bee comes to rest when it grips this corridor's cube: out from the cube's centre,
     * along the face the corridor leaves through, by the standoff the bee actually holds at.
     *
     * In holder-local cells, since that is what the corridor is in - the standoff is a world
     * distance, so it divides by the holder's fit scale to get there.
     *
     * This exists because the corridor's first entry is the cube's OWN cell. A leg aimed there flies
     * the bee into the cube and leaves the landing pose to pull it back out in a single frame, on the
     * frames the bee is largest and about to hold still. The same mistake in the Unity build of this
     * game was logged as its clearest source of bees passing through the model.
     */
    private attachPointFor(corridor: Vec3[], bulletItem: BulletItem | null, cellWorldSize: number): Vec3
    {
        const cube = corridor[0];
        if (!bulletItem || cellWorldSize <= 1e-6) return cube.clone();

        const dir = new Vec3();
        if (!LevelController.corridorDir(dir, corridor)) return cube.clone();

        const standoffCells = bulletItem.getStandoffDistance() / cellWorldSize;
        return new Vec3(
            cube.x + dir.x * standoffCells,
            cube.y + dir.y * standoffCells,
            cube.z + dir.z * standoffCells,
        );
    }

    /**
     * Outward unit direction of a corridor - cube towards mouth - in the holder's own space. False
     * when there is no second cell to take a direction from.
     *
     * One definition shared by everything that measures along a corridor, because they all have to
     * agree: the attach point, the commit point and the plug-out are all offsets along this axis, and
     * a sign or normalisation difference between any two of them puts the bee on the wrong side of
     * the cube it is holding.
     */
    private static corridorDir(out: Vec3, corridor: Vec3[]): boolean
    {
        if (corridor.length < 2) return false;

        Vec3.subtract(out, corridor[1], corridor[0]);
        if (out.lengthSqr() < 1e-8) return false;

        out.normalize();
        return true;
    }

    /**
     * Where the bee lines up before committing: APPROACH_MARGIN_CELLS out from its grip, along the
     * corridor.
     *
     * Clamped to the mouth, never past it. Beyond the mouth is open air and would be safe to fly, but
     * the descent leg runs mouth-to-here and a commit point outside would send it backwards. A cube
     * whose corridor is shallower than the margin simply gets a shorter commit - which is what
     * DIVE_MIN_DURATION is there to keep visible.
     */
    private commitPointFor(corridor: Vec3[], attachPoint: Vec3): Vec3
    {
        const mouth = corridor[corridor.length - 1];

        const dir = new Vec3();
        if (!LevelController.corridorDir(dir, corridor)) return mouth.clone();

        const room = Vec3.distance(attachPoint, mouth);
        const margin = Math.min(APPROACH_MARGIN_CELLS, room);

        return new Vec3(
            attachPoint.x + dir.x * margin,
            attachPoint.y + dir.y * margin,
            attachPoint.z + dir.z * margin,
        );
    }

    /**
     * The beat at the corridor mouth: the bee holds off the pile and circles before committing
     * inward, so the flight has a moment of deciding in it rather than running muzzle-to-face in one
     * continuous move.
     *
     * The circle is written into the position directly rather than left to BulletItem's weave, which
     * is a deviation from a path and has nothing to deviate from while the bee is holding station.
     *
     * Safe against the map because the mouth is one cell OUTSIDE the grid and the radius is well
     * under a cell: nothing can rotate into the space being circled. The plane is the two axes the
     * corridor does not use, so the circle is always across the corridor rather than along it - a
     * circle in the corridor's own axis would be the bee bobbing in and out of the hole.
     */
    private hoverBulletAtGate(bullet: Node, corridor: Vec3[], onDone: () => void): void
    {
        const mouth = corridor[corridor.length - 1];

        if (GATE_HOVER_DURATION <= 0 || GATE_HOVER_RADIUS_CELLS <= 0 || corridor.length < 2)
        {
            onDone();
            return;
        }

        // Two axes perpendicular to the corridor, in the holder's own space. A corridor runs along
        // exactly one grid axis, so the other two are just the next two axes round - no cross
        // products, and no chance of picking a degenerate pair.
        //
        // Taken from the corridor's own last step, NOT from where the bullet is: the arc leg has
        // just set the bullet down ON the mouth, so a direction measured from its position would be
        // a zero vector and the axis would be whatever the comparisons fell through to.
        const corridorAxis = LevelController.dominantAxis(mouth, corridor[corridor.length - 2]);
        const axisU = LevelController.UNIT_AXES[(corridorAxis + 1) % 3];
        const axisV = LevelController.UNIT_AXES[(corridorAxis + 2) % 3];

        // Each bee starts somewhere else on the circle, so two arriving together do not orbit in
        // lockstep.
        const phase = Math.random() * Math.PI * 2;
        const radius = GATE_HOVER_RADIUS_CELLS;

        const localPos = new Vec3();
        const hoverObj = { t: 0 };
        tween(hoverObj)
            .to(GATE_HOVER_DURATION, { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;

                    const angle = phase + hoverObj.t * Math.PI * 2 * GATE_HOVER_TURNS;
                    // Faded in and out by sin(pi*t), so the bee eases off the arc's end point and is
                    // back on it before the dive: the hover neither starts nor ends with a step, and
                    // the dive begins from the corridor's own line.
                    const fade = Math.sin(Math.PI * hoverObj.t) * radius;
                    const u = Math.cos(angle) * fade;
                    const v = Math.sin(angle) * fade;

                    localPos.set(
                        mouth.x + axisU.x * u + axisV.x * v,
                        mouth.y + axisU.y * u + axisV.y * v,
                        mouth.z + axisU.z * u + axisV.z * v,
                    );
                    bullet.setPosition(localPos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;
                    onDone();
                }
            })
            .start();
    }

    /** The three grid axes, indexable so "the other two" is arithmetic rather than a branch. */
    private static readonly UNIT_AXES: readonly Vec3[] = [
        new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1),
    ];

    /** Which grid axis (0 = x, 1 = y, 2 = z) the run from `from` to `to` mostly follows. */
    private static dominantAxis(to: Vec3, from: Vec3): number
    {
        const dx = Math.abs(to.x - from.x);
        const dy = Math.abs(to.y - from.y);
        const dz = Math.abs(to.z - from.z);
        if (dx >= dy && dx >= dz) return 0;
        if (dy >= dz) return 1;
        return 2;
    }

    /**
     * The descent from the corridor mouth down to the point the bee commits from - a plain straight
     * travel leg, continuing at the speed the arc flew in at.
     *
     * This is the leg that absorbs how deep the cube sits, so the commit after it does not have to.
     * Linear and at APPROACH_SPEED because it is travel and nothing else: the deciding already
     * happened at the hover above, and the committing happens below.
     *
     * Skipped outright when the cube's corridor is shallower than the commit margin, which puts the
     * commit point at the mouth and leaves this leg nothing to cover.
     */
    private descendBulletToGate(bullet: Node, from: Vec3, to: Vec3, cellWorldSize: number, onArrived: () => void): void
    {
        const span = Vec3.distance(from, to) * cellWorldSize;
        if (span <= 1e-4)
        {
            onArrived();
            return;
        }

        const localPos = new Vec3();
        const pathObj = { t: 0 };
        tween(pathObj)
            .to(Math.max(span / APPROACH_SPEED, 0.01), { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    Vec3.lerp(localPos, from, to, pathObj.t);
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
     * The commit: the last APPROACH_MARGIN_CELLS onto the face, ending exactly on the attach point the
     * bee grips from.
     *
     * A fixed distance, so this beat is the same on every cube - see APPROACH_MARGIN_CELLS. Paced by
     * max(floor, distance / DIVE_SPEED); with the distance fixed those agree, and both still cover the
     * edge cases the constants describe.
     *
     * cubicOut, so the bee goes in fast and SLOWS as it closes, like it is picking its grip. The
     * opposite - accelerating in - is what this had first, and it reads as the bee being sucked into
     * the cube rather than choosing to land on it. The Unity build of this game shipped ease-in,
     * playtested it, and reversed it for exactly that reason.
     */
    private diveBulletOntoFace(bullet: Node, from: Vec3, to: Vec3, cellWorldSize: number, onArrived: () => void): void
    {
        const span = Vec3.distance(from, to) * cellWorldSize;
        const duration = Math.max(DIVE_MIN_DURATION, span / DIVE_SPEED);

        const localPos = new Vec3();
        const pathObj = { t: 0 };
        tween(pathObj)
            .to(duration, { t: 1 }, {
                easing: easing.cubicOut,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    Vec3.lerp(localPos, from, to, pathObj.t);
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
        bulletItem.grabCube();
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

        // Pop: a short shove further out along the corridor, so the cube visibly snaps free before
        // the bee settles into carrying it.
        //
        // From WHERE THE BEE IS, not from the cube's cell. The bee grips from a standoff outside the
        // face (see attachPointFor) - popping from the cell would teleport it back inside the cube it
        // is holding and heave from there.
        const popFrom = bullet.position.clone();
        const cube = corridor[0];
        const nextCell = corridor.length > 1 ? corridor[1] : corridor[0];
        const popDir = new Vec3(nextCell.x - cube.x, nextCell.y - cube.y, nextCell.z - cube.z);
        if (popDir.lengthSqr() > 1e-8) popDir.normalize();
        const popTo = new Vec3(
            popFrom.x + popDir.x * POP_DISTANCE_CELLS,
            popFrom.y + popDir.y * POP_DISTANCE_CELLS,
            popFrom.z + popDir.z * POP_DISTANCE_CELLS,
        );

        // What is left of the corridor once the pop has covered its first stretch - and only what is
        // still AHEAD of it. The pop now starts from the standoff rather than the cell, so it can
        // finish past the first cell or two; keeping those would fly the bee back inward to pick
        // them up before setting off out again.
        const popOut = Vec3.dot(popDir, popTo) - Vec3.dot(popDir, cube);
        const corridorAfterPop: Vec3[] = [ popTo ];
        for (let i = 1; i < corridor.length; i++)
        {
            const cellOut = Vec3.dot(popDir, corridor[i]) - Vec3.dot(popDir, cube);
            if (cellOut > popOut) corridorAfterPop.push(corridor[i]);
        }

        const popObj = { t: 0 };
        tween(popObj)
            .to(POP_DURATION, { t: 1 }, {
                // quartOut, not linear: a heave is fast at the moment it breaks free and slows as it
                // runs out. Over the longer duration a linear shove reads as the cube being towed
                // rather than yanked - the extra time has to go into the settle, not the break.
                easing: easing.quartOut,
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
                const bulletItem = bullet.getComponent(BulletItem);
                bulletItem?.setApproachWeaveSuppressed(false);
                bulletItem?.beginCarry();
                this.flyBulletAlongCorridor(bullet, corridorAfterPop, cellWorldSize);
            })
            .start();
    }

    /**
     * Carries the cube down the clear corridor, but keeps the bee itself in world space. The local
     * corridor points are transformed every frame, so rotating the grid cannot make it clip a cube;
     * unlike parenting to cubeBlockHolder, dragging the grid also cannot make the bee inherit an
     * abrupt rotation/translation and look as if it stopped to work out where it is.
     */
    private flyBulletAlongCorridor(bullet: Node, corridor: Vec3[], cellWorldSize: number): void
    {
        if (!bullet.isValid) return;

        // Nothing of the corridor left ahead of the pop, which is the ordinary case for a cube on the
        // surface: its corridor is one cell deep and the heave already carried the bee past the mouth.
        // Hand straight over rather than run a zero-length leg.
        if (corridor.length < 2)
        {
            bullet.setParent(this.bulletPool.node, true);
            this.flyBulletToExitTarget(bullet);
            return;
        }

        // Dead straight down the corridor: it is the one line through the pile guaranteed clear of
        // cubes, and a cube in hand wandering off it would go through its neighbours. The weave is
        // taken back up by the exit leg, in open air.
        //
        // No deadline handed over, unlike the way in: there is nothing to unwind here. The landing
        // already put the bee exactly on the path, and no leg since has had a sway target to weave
        // against. This call is the guard that keeps it that way, not a straightening.
        bullet.getComponent(BulletItem)?.holdSwayStraight();

        // Detach once the block is free. The carried cube remains a child of the bee, so it follows
        // naturally; only the grid transform is deliberately left behind.
        bullet.setParent(this.bulletPool.node, true);

        const localPos = new Vec3();
        const worldPos = new Vec3();

        const corridorObj = { t: 0 };
        tween(corridorObj)
            .to(LevelController.pathTravelTime(corridor, cellWorldSize), { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    lerpMultiplePoints(localPos, corridor, corridorObj.t);
                    Vec3.transformMat4(worldPos, localPos, this.levelGrid3D.cubeBlockHolder.worldMatrix);
                    bullet.setWorldPosition(worldPos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;

                    this.flyBulletToExitTarget(bullet);
                }
            })
            .start();
    }

    /** Curves to just below the exit, then makes one clean straight entry into it. */
    private flyBulletToExitTarget(bullet: Node): void
    {
        const span = this.BoundsSize;
        const radius = Math.hypot(span.x, span.y, span.z) * 0.5 + EXIT_CLEARANCE;
        const target = this.bulletExitTarget;
        const from = bullet.worldPosition.clone();
        const hive = target ? target.worldPosition.clone() : new Vec3(from.x, from.y + radius * EXIT_CLIMB_HEIGHT_RATIO, from.z);
        const screenUp = new Vec3();
        if (this.levelGrid3D.camera) Vec3.transformQuat(screenUp, Vec3.UP, this.levelGrid3D.camera.node.worldRotation);
        if (screenUp.lengthSqr() <= 1e-6) screenUp.set(0, 1, 0);
        else screenUp.normalize();

        // This is the end of the curve. It stays a little below the exit in screen space, so the
        // second leg is an obvious straight flight up into the target rather than a drop from above.
        const entry = new Vec3(
            hive.x - screenUp.x * RETURN_ENTRY_BELOW_EXIT,
            hive.y - screenUp.y * RETURN_ENTRY_BELOW_EXIT,
            hive.z - screenUp.z * RETURN_ENTRY_BELOW_EXIT,
        );
        const toEntry = new Vec3(entry.x - from.x, entry.y - from.y, entry.z - from.z);
        const entryDistance = toEntry.length();
        const towardEntry = entryDistance > 1e-6 ? toEntry.normalize() : screenUp.clone();
        const back = new Vec3(-towardEntry.x, -towardEntry.y, -towardEntry.z);
        const wobble = new Vec3(
            (Math.random() * 2 - 1) * RETURN_LANE_JITTER,
            (Math.random() * 2 - 1) * RETURN_LANE_JITTER * 0.5,
            (Math.random() * 2 - 1) * RETURN_LANE_JITTER,
        );
        const controlA = new Vec3(
            from.x + towardEntry.x * entryDistance * 0.28 + wobble.x,
            from.y + towardEntry.y * entryDistance * 0.28 + wobble.y,
            from.z + towardEntry.z * entryDistance * 0.28 + wobble.z,
        );
        const controlB = new Vec3(
            entry.x - towardEntry.x * entryDistance * 0.18 + wobble.x * 0.35,
            entry.y - towardEntry.y * entryDistance * 0.18 + wobble.y * 0.35,
            entry.z - towardEntry.z * entryDistance * 0.18 + wobble.z * 0.35,
        );
        const curveLength = Vec3.distance(from, controlA) + Vec3.distance(controlA, controlB) + Vec3.distance(controlB, entry);
        const bulletItem = bullet.getComponent(BulletItem);

        // Unity locks facing for this little turn/wind-up beat. Once the curve starts, BulletItem
        // follows the actual curved movement at its weighted carry turn speed.
        bulletItem?.holdFacing();
        const windUp = { t: 0 };
        tween(windUp)
            .delay(RETURN_TURN_DURATION)
            .to(RETURN_WINDUP_DURATION, { t: 1 }, {
                easing: easing.sineInOut,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    const pull = Math.sin(windUp.t * Math.PI) * RETURN_WINDUP_DISTANCE;
                    bullet.setWorldPosition(from.x + back.x * pull, from.y + back.y * pull, from.z + back.z * pull);
                },
            })
            .call(() =>
            {
                if (!bullet.isValid) return;
                bulletItem?.setSwayTarget(null, entry);
                const flyPos = new Vec3();
                const returnObj = { t: 0 };
                tween(returnObj)
                    .to(Math.max(curveLength / RETURN_SPEED, 0.01), { t: 1 }, {
                        easing: easing.linear,
                        onUpdate: () =>
                        {
                            if (!bullet.isValid) return;
                            cubicBezier(flyPos, from, controlA, controlB, entry, returnObj.t);
                            bullet.setWorldPosition(flyPos);
                        },
                        onComplete: () =>
                        {
                            if (!bullet.isValid) return;
                            this.flyStraightIntoExit(bullet, entry, target, hive);
                        }
                    })
                    .start();
            })
            .start();
    }

    /** Final straight leg from the below-exit entry point to the live exit target. */
    private flyStraightIntoExit(bullet: Node, from: Vec3, target: Node | null, fallbackExit: Vec3): void
    {
        const initialEnd = target ? target.worldPosition : fallbackExit;
        const duration = Math.max(Vec3.distance(from, initialEnd) / RETURN_SPEED, 0.01);
        bullet.getComponent(BulletItem)?.setSwayTarget(target, target ? Vec3.ZERO : fallbackExit);

        const pos = new Vec3();
        const progress = { t: 0 };
        tween(progress)
            .to(duration, { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    const end = target ? target.worldPosition : fallbackExit;
                    Vec3.lerp(pos, from, end, progress.t);
                    bullet.setWorldPosition(pos);
                },
                onComplete: () =>
                {
                    if (!bullet.isValid) return;
                    bullet.getComponent(BulletItem)?.releaseCube();
                    this.bulletPool.returnBullet(bullet);
                }
            })
            .start();
    }

    /**
     * The second half of the exit: from the exit point, hook round from the heading it arrived on
     * and climb straight up until it is clear, then drop the cube and park the bullet.
     *
     * `hook` is the SAME handle the way across arrived with, re-used here on the far side of the
     * point - that shared line is the whole reason the turn is a curve and not a corner, so it is
     * handed in rather than re-derived. The upper handle sits directly below the top, which is what
     * makes the climb finish dead vertical instead of drifting off sideways as it leaves.
     */
    private flyBulletUpFromExit(bullet: Node, exitAt: Vec3, hook: Readonly<Vec3>, topAt: Vec3): void
    {
        // The exit may have moved while the bee was crossing to it; the climb goes up from where the
        // bee actually is, not from where the point was when the leg was planned.
        topAt.x = exitAt.x;
        topAt.z = exitAt.z;

        const climbDistance = Math.max(topAt.y - exitAt.y, 0);

        const climbA = new Vec3(exitAt.x + hook.x, exitAt.y, exitAt.z + hook.z);
        // Half way up and directly under the top: the curve straightens onto the vertical well
        // before it gets there, so the last of the climb is genuinely straight up.
        const climbB = new Vec3(topAt.x, topAt.y - climbDistance * 0.5, topAt.z);

        // Nothing to unwind onto up here - it ends in a recycle - but the weave still needs an end to
        // measure its arc against, or it holds the line for the whole climb.
        bullet.getComponent(BulletItem)?.setSwayTarget(null, topAt);

        const flyPos = new Vec3();
        const climbObj = { t: 0 };

        const duration = Math.max((climbDistance + hook.length()) / BULLET_SPEED, 0.01);

        tween(climbObj)
            .to(duration, { t: 1 }, {
                easing: easing.linear,
                onUpdate: () =>
                {
                    if (!bullet.isValid) return;
                    cubicBezier(flyPos, exitAt, climbA, climbB, topAt, climbObj.t);
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
     * Seconds a bullet needs to walk `path` at `speed`, which is how every leg that covers a VARIABLE
     * distance is timed - the outbound corridor at BULLET_SPEED, the dive at DIVE_SPEED. Legs whose
     * distance is fixed (the gate hover's circle, the plug-out's shove) can be given a duration
     * outright, because a fixed distance over a fixed time is already a fixed speed.
     * `unitScale` converts the path's units into world units - 1 for a world-space path, the
     * holder's cell size for a local-space one.
     */
    private static pathTravelTime(path: Vec3[], unitScale: number = 1, speed: number = BULLET_SPEED): number
    {
        let length = 0;
        for (let i = 1; i < path.length; i++) length += Vec3.distance(path[i - 1], path[i]);

        // The floor matters more now that the dive uses this: a cube sitting flush with the surface
        // has barely any corridor left once the standoff is taken off, and a zero-length tween would
        // complete before its onUpdate ever wrote a position.
        return Math.max((length * unitScale) / Math.max(speed, 1e-4), 0.01);
    }

    //#endregion

    //#region Lose detection

    /**
     * Called by every conveyor shooter that looked for a cube of its color and found none.
     *
     * A shooter with nothing to shoot is ordinary - the pile is peeled from the outside, so its color
     * spends most of the level buried. It is only a loss when NOTHING on the conveyor can ever fire
     * again, which needs all three of:
     *   - every slot taken, since a free one means the player can still tap a queued shooter in and
     *     bring a colour the conveyor does not currently hold;
     *   - every shooter in those slots still holding ammo, since a spent one leaves and frees its
     *     slot, which is the same escape;
     *   - not one of their colors left with a reachable cube in the pile.
     *
     * Reachability is the whole test - a cube being hidden behind another, or already claimed by a
     * bullet, says "not this instant", not "not ever" (see LevelGrid3D.collectReachableColors).
     */
    public checkLose(): void
    {
        if (this._isFinished) return;
        if (!this.isConveyorDeadlocked()) return;

        this.lose();
    }

    /** Whether no shooter on the conveyor can fire again, and none can be replaced - see checkLose(). */
    private isConveyorDeadlocked(): boolean
    {
        if (!this.levelGrid3D || !this.conveyor) return false;

        // A cube a bullet is already flying at is about to leave the pile, and taking it out can open
        // a corridor for any of these colors - nothing is decided until it lands.
        if (this.levelGrid3D.hasReservedTiles()) return false;

        const floaters = this.conveyor.floaters;
        if (floaters.length === 0) return false;

        this._conveyorColors.clear();
        for (let i = 0; i < floaters.length; i++)
        {
            const shooter = floaters[i].getShooter();
            if (!shooter) return false;                 // free slot: a queued shooter can still come in
            if (shooter.getAmmoCount() <= 0) return false; // spent: on its way out, freeing this slot
            this._conveyorColors.add(shooter.getColorID());
        }

        this.levelGrid3D.collectReachableColors(this._reachableColors);
        for (const colorID of this._conveyorColors)
        {
            if (this._reachableColors.has(colorID)) return false;
        }

        return true;
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

    //#endregion
}
