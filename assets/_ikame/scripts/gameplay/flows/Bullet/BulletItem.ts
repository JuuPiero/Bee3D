import { _decorator, CCFloat, Component, MeshRenderer, Node, Quat, Vec3 } from 'cc';
import { RotateToForwardVelocity } from '../../../commons/RotateToForwardVelocity';
const { ccclass, property } = _decorator;

// Fallback names, used when the two nodes below are not wired up in the prefab.
const CHARACTER_NODE_NAME = 'Character';
const CUBE_NODE_NAME = 'PixelBlock-Bee';

const DEG_TO_RAD = Math.PI / 180;

/** What the bee is doing right now, which is what decides who controls its pose. */
enum BulletPhase
{
    /** Parked in the pool, or flying empty-handed - nothing here touches the transform. */
    Idle,
    /** On its way to a cube. RotateToForwardVelocity points it down its own travel direction. */
    Approach,
    /** Settled on the face it is about to pull, holding still for a beat before it heaves. */
    Landing,
    /** Heaving the cube out of the wall. Bee and cube are one rigid piece for this. */
    PlugOut,
    /** Hauling the cube away: gravity decides the layout, movement tilts it. */
    Carry,
}

/**
 * The bee that flies out of a shooter, pulls one cube out of the map and carries it away.
 *
 * The cube it carries is not spawned - it is a node that ships with the Bullet prefab and is
 * simply switched off until there is something to hold, because bullets are pooled and a cube
 * that is instantiated per shot would be an allocation (and a destroy) on every hit. On the merged
 * mesh path an individual cube has no node of its own anyway, so this stand-in is what the player
 * sees being plugged out.
 *
 * The flight is four beats - fly in, land on a face, plug the cube out, haul it away - and each
 * one owns the pose differently, which is why the phase is explicit. The one that matters most is
 * the last: from the moment the cube comes free the rig is laid out by GRAVITY, bee on top and
 * cube hanging below, and the only thing movement does to it is tilt it. Everything before that is
 * about the face being pulled, and everything after is about which way is down.
 *
 * The prefab decides how bee and cube sit together - the authored offset is both the direction the
 * bee grips from and how far off the cube's surface it sits - so nothing here positions a child
 * outright, it only re-applies that arrangement about the axis in play.
 */
@ccclass('BulletItem')
export class BulletItem extends Component
{
    @property({ type: Node, tooltip: 'The bee. Falls back to the child named "Character".' })
    public characterRoot: Node = null;

    @property({ type: Node, tooltip: 'Stand-in cube, off until this bullet grabs one. Falls back to the child named "PixelBlock-Bee".' })
    public cubeNode: Node = null;

    @property({ type: CCFloat, tooltip: 'Extra clearance between the bee and the cube face it grips, on top of whatever gap the prefab was authored with. Positive lifts it off the face, negative sinks it in.' })
    public extraCharacterGap: number = 0;

    @property({ type: CCFloat, tooltip: 'Degrees per second the bee turns onto the face it lands on, and the rig tips as it leans. Lower is lazier.' })
    public characterRotateSpeed: number = 220;

    @property({ type: CCFloat, tooltip: 'How far (degrees) the rig leans into its travel direction at full speed, as a load being dragged does.' })
    public maxLeanAngle: number = 25;

    @property({ type: CCFloat, tooltip: 'Speed (world units per second) at which the lean reaches maxLeanAngle. Match it to the bullet speed for a full lean on the fast legs.' })
    public leanReferenceSpeed: number = 22;

    @property({ type: CCFloat, tooltip: 'How hard the hanging cube is pulled back under the bee, per second. Lower = heavier cube that swings wider and settles slower; high values approach a rigid attachment.' })
    public dragFollowSpeed: number = 9;

    @property({ type: CCFloat, tooltip: 'Furthest (world units) the hanging cube may swing from where it would rigidly sit, so it never strings out on a fast leg.' })
    public dragMaxLag: number = 0.6;

    @property({ type: CCFloat, tooltip: 'How quickly the bee slides back to its authored spot above the cube once it starts hauling, per second.' })
    public characterSettleSpeed: number = 8;

    private _phase: BulletPhase = BulletPhase.Idle;

    private _cubeRenderer: MeshRenderer = null;
    private readonly _facing = new Quat();

    // Where the pull direction lands in the bullet's own space. landOnFace() aims the bullet down
    // that direction, so in its local frame the pull is always the same axis - which is why the
    // grip pose can be worked out once instead of per shot.
    private readonly _localOutAxis = new Vec3(0, 0, 1);
    private readonly _gripRotation = new Quat();

    private readonly _targetRotation = new Quat();
    private readonly _turnScratch = new Quat();
    private _isTurning = false;

    // Measured per frame, so the carry can tilt against the flight's actual direction rather than
    // against whichever leg happens to be running.
    private readonly _worldPosNow = new Vec3();
    private readonly _prevWorldPos = new Vec3();
    private readonly _frameMove = new Vec3();
    private _hasPrevWorldPos = false;
    private readonly _leanDir = new Vec3();
    private readonly _leanUp = new Vec3();
    private readonly _poseScratch = new Quat();

    // Aims the bullet's forward down its velocity while it flies in; stood down from the landing
    // onwards, where the pose is driven from here instead.
    private _travelFacing: RotateToForwardVelocity = null;

    // The hanging cube swinging under the bee rather than being welded to it: where it actually is
    // right now, and where it would be if it were rigidly attached (which is what it chases).
    private readonly _swingPos = new Vec3();
    private readonly _swingRot = new Quat();
    private readonly _swingAnchorPos = new Vec3();
    private readonly _swingAnchorRot = new Quat();
    private readonly _swingOffset = new Vec3();

    // The prefab's authored layout, captured once and restored on every release - a grab only ever
    // measures its changes against these, so repeated shots cannot drift.
    private readonly _cubeBaseScale = new Vec3(1, 1, 1);
    private readonly _cubeBasePos = new Vec3();
    private readonly _cubeBaseRot = new Quat();
    private readonly _characterBasePos = new Vec3();
    private readonly _characterBaseRot = new Quat();
    // Which way the bee sits from the cube in the prefab (usually straight up), and how far past
    // the cube's own surface that puts it. Both are what a landing re-applies along the pull axis.
    private readonly _characterBaseDir = new Vec3(0, 1, 0);
    private _characterSurfaceGap = 0;

    private readonly _characterPos = new Vec3();
    private readonly _characterRestPos = new Vec3();

    protected onLoad(): void
    {
        if (!this.characterRoot) this.characterRoot = this.node.getChildByName(CHARACTER_NODE_NAME);
        if (!this.cubeNode) this.cubeNode = this.node.getChildByName(CUBE_NODE_NAME);

        // The renderer usually sits on a child of the cube (CubeRoot/Render), not on the cube node.
        this._cubeRenderer = this.cubeNode ? this.cubeNode.getComponentInChildren(MeshRenderer) : null;

        this._travelFacing = this.getComponent(RotateToForwardVelocity);

        if (this.cubeNode)
        {
            this._cubeBaseScale.set(this.cubeNode.scale);
            this._cubeBasePos.set(this.cubeNode.position);
            this._cubeBaseRot.set(this.cubeNode.rotation);
        }

        if (this.characterRoot)
        {
            this._characterBasePos.set(this.characterRoot.position);
            this._characterBaseRot.set(this.characterRoot.rotation);

            const distance = this._characterBasePos.length();
            if (distance > 1e-5)
            {
                Vec3.multiplyScalar(this._characterBaseDir, this._characterBasePos, 1 / distance);
            }
            // Whatever the prefab leaves between the bee and the cube's surface - kept as-is, just
            // re-applied along whichever face the bee lands on.
            this._characterSurfaceGap = distance - this._cubeBaseScale.y * 0.5;
        }

        this.cacheGripPose();

        this.releaseCube();
    }

    /**
     * Works out, once, the pose the bee holds while gripping a face.
     *
     * landOnFace() aims the bullet with the same Quat.fromViewUp() the travel-facing component
     * uses, so the pull direction always lands on one fixed axis of the bullet's own frame - found
     * here by running that call on a probe direction and undoing it, rather than by assuming which
     * axis the engine treats as forward. The grip pose is then the prefab's authored arrangement
     * swung onto that axis, which puts the bee on the face the cube leaves through.
     */
    private cacheGripPose(): void
    {
        const probe = new Vec3(0, 0, 1);
        const probeFacing = new Quat();
        Quat.fromViewUp(probeFacing, probe);
        Quat.invert(probeFacing, probeFacing);
        Vec3.transformQuat(this._localOutAxis, probe, probeFacing);
        this._localOutAxis.normalize();

        Quat.rotationTo(this._gripRotation, this._characterBaseDir, this._localOutAxis);
        Quat.multiply(this._gripRotation, this._gripRotation, this._characterBaseRot);
    }

    //#region phases

    /** Leaves the muzzle empty-handed and flying nose-first. Called as the shot is fired. */
    public beginApproach(): void
    {
        this.releaseCube();
        this._phase = BulletPhase.Approach;
    }

    /**
     * Lands on the face the cube will be pulled out of: the bullet is aimed down the pull
     * direction and the bee is put on that face, standing off it by the cube's half-size plus the
     * prefab's own gap. The turn onto the face is eased rather than snapped, so it reads as the bee
     * settling rather than teleporting into a grip.
     *
     * `worldScale` is the size the map draws its cubes at, and the stand-in is resized to it here
     * even though it is still hidden - the bee has to stand off the face of the cube it is landing
     * on, which is the map's one, not whatever size the prefab happens to author.
     *
     * Nothing is taken yet: the cube is still part of the wall, and the bee holds on to it for a
     * beat before it heaves.
     */
    public landOnFace(outwardDir: Readonly<Vec3>, worldScale: Readonly<Vec3>): void
    {
        this._phase = BulletPhase.Landing;

        // From here the pose is ours; the travel-facing component would fight every write.
        if (this._travelFacing) this._travelFacing.enabled = false;

        this.faceOutward(outwardDir);

        if (!this.cubeNode || !this.characterRoot) return;

        this.cubeNode.setWorldScale(worldScale);

        this.standoffAlong(this._characterPos, this._localOutAxis);
        this.characterRoot.setPosition(this._characterPos);

        this.turnCharacterTo(this._gripRotation);
    }

    /**
     * Takes the cube: the stand-in - already sized to the map's cube by the landing - is switched
     * on and coloured to match. Called when the hover ends and the map's own cube is removed in the
     * same frame, so the swap from mesh to node is not visible.
     *
     * Bee and cube stay rigid through the heave that follows - they are one piece until the cube is
     * free of the wall.
     */
    public grabCube(colorBytes: Uint8Array, shadowBytes: Uint8Array): void
    {
        this._phase = BulletPhase.PlugOut;

        if (!this.cubeNode) return;

        this.cubeNode.active = true;

        if (this._cubeRenderer && colorBytes && shadowBytes)
        {
            this._cubeRenderer.setInstancedAttribute('a_instColor', colorBytes);
            this._cubeRenderer.setInstancedAttribute('a_instColorShadow', shadowBytes);
        }
    }

    /**
     * The cube is out. From here gravity lays the rig out and movement tilts it - see
     * carryUnderGravity() and swingCube() - and the bee goes back to the spot the prefab gave it,
     * which with an upright rig is exactly on top of the cube.
     */
    public beginCarry(): void
    {
        this._phase = BulletPhase.Carry;

        this.turnCharacterTo(this._characterBaseRot);

        if (this.cubeNode)
        {
            // Start the swing from where the cube already is, so it does not jump.
            this.cubeNode.getWorldPosition(this._swingPos);
            this.cubeNode.getWorldRotation(this._swingRot);
        }
    }

    /** Empty-handed again - called as a bullet is fired, and once it is done with its cube. */
    public releaseCube(): void
    {
        this._phase = BulletPhase.Idle;

        if (this.cubeNode)
        {
            this.cubeNode.active = false;
            this.cubeNode.setScale(this._cubeBaseScale);
            this.cubeNode.setPosition(this._cubeBasePos);
            this.cubeNode.setRotation(this._cubeBaseRot);
        }
        if (this.characterRoot)
        {
            this.characterRoot.setPosition(this._characterBasePos);
            this.characterRoot.setRotation(this._characterBaseRot);
        }

        this._isTurning = false;
        this._hasPrevWorldPos = false;
        this._leanDir.set(0, 0, 0);
        if (this._travelFacing) this._travelFacing.enabled = true;
    }

    public isCarryingCube(): boolean
    {
        return !!this.cubeNode && this.cubeNode.active;
    }

    //#endregion

    /**
     * The carry pose, run every frame while the cube is being hauled.
     *
     * In lateUpdate() because the tweens that fly the bullet run during update() - this has to see
     * where the bullet actually ended up this frame, not where it was at the start of it.
     */
    protected lateUpdate(dt: number): void
    {
        this.measureMovement();

        if (this._phase !== BulletPhase.Carry) return;

        this.carryUnderGravity(dt);
        this.swingCube(dt);
    }

    /**
     * Lays the rig out by gravity and tilts it by movement: the bullet's up vector is world up,
     * leaned over into the direction of travel by an angle that grows with speed.
     *
     * Up is the whole point. The bee is authored above the cube, so an up vector that stays near
     * vertical keeps the bee on top and the cube hanging below on every leg, however the flight
     * turns - which the previous rule (up along the heading) could not do, since it left no such
     * thing as "above" and rolled the pair over as the exit arch swung round.
     *
     * Only the part of the heading perpendicular to up leans it, so a straight climb stands upright
     * - there is no leaning into "up" - and that falls out of the maths rather than needing a case
     * of its own. The rotation is the minimal one onto that leaned up vector, so the rig never
     * picks up yaw or roll of its own; and it is a WORLD rotation, because during the corridor leg
     * the bullet is still parented to the rotating cube holder and gravity does not rotate with the
     * level.
     */
    private carryUnderGravity(dt: number): void
    {
        if (dt > 1e-6 && this._frameMove.lengthSqr() > 1e-10)
        {
            // Horizontal part of this frame's movement: what there is to lean into.
            const vertical = Vec3.dot(this._frameMove, Vec3.UP);
            this._leanDir.set(
                this._frameMove.x - Vec3.UP.x * vertical,
                this._frameMove.y - Vec3.UP.y * vertical,
                this._frameMove.z - Vec3.UP.z * vertical,
            );

            const horizontalSpeed = this._leanDir.length() / dt;
            if (horizontalSpeed > 1e-4)
            {
                this._leanDir.normalize();

                const reference = Math.max(1e-4, this.leanReferenceSpeed);
                const leanFactor = Math.min(1, horizontalSpeed / reference) * Math.tan(this.maxLeanAngle * DEG_TO_RAD);

                this._leanUp.set(
                    Vec3.UP.x + this._leanDir.x * leanFactor,
                    Vec3.UP.y + this._leanDir.y * leanFactor,
                    Vec3.UP.z + this._leanDir.z * leanFactor,
                );
                this._leanUp.normalize();
            }
            else
            {
                this._leanUp.set(Vec3.UP);
            }
        }
        else
        {
            this._leanUp.set(Vec3.UP);
        }

        Quat.rotationTo(this._poseScratch, Vec3.UP, this._leanUp);
        BulletItem.stepRotation(this._turnScratch, this.node.worldRotation, this._poseScratch, this.characterRotateSpeed, dt);
        this.node.setWorldRotation(this._turnScratch);

        // The bee slides back to sitting on top of the cube - the prefab's arrangement, but
        // measured against the map's cube size rather than the one the prefab was authored with.
        if (this.characterRoot)
        {
            this.standoffAlong(this._characterRestPos, this._characterBaseDir);

            const t = 1 - Math.exp(-Math.max(0, this.characterSettleSpeed) * dt);
            Vec3.lerp(this._characterPos, this.characterRoot.position, this._characterRestPos, t);
            this.characterRoot.setPosition(this._characterPos);
        }
    }

    /**
     * Where the bee sits when it is holding the cube from direction `axis`: clear of the cube's
     * surface by the gap the prefab was authored with. Measured against the cube's CURRENT size,
     * since the stand-in is resized to whatever the map draws its cubes at and the authored offset
     * would leave the bee floating off a smaller one.
     */
    private standoffAlong(out: Vec3, axis: Readonly<Vec3>): Vec3
    {
        const halfSize = this.cubeNode ? this.cubeNode.scale.y * 0.5 : 0;
        return Vec3.multiplyScalar(out, axis, halfSize + this._characterSurfaceGap + this.extraCharacterGap);
    }

    /**
     * Hangs the cube under the bee instead of welding it there.
     *
     * Each frame the cube chases the spot it would rigidly occupy, position and rotation both, at
     * dragFollowSpeed - so it swings out when the bee accelerates or turns a corner, and settles
     * back in line once the speed is steady. That lag is the whole effect: a rigidly parented cube
     * reads as part of the bee, a lagging one reads as a weight on the end of its grip.
     * dragMaxLag stops it stringing out on the fastest legs.
     */
    private swingCube(dt: number): void
    {
        // Nothing in hand: a cube with health left is only damaged, not taken, and the bee flies
        // home empty.
        if (!this.cubeNode || !this.cubeNode.active) return;

        // Where a rigidly attached cube would be right now.
        Vec3.transformMat4(this._swingAnchorPos, this._cubeBasePos, this.node.worldMatrix);

        // Frame-rate independent smoothing: the same pull per second whatever dt happens to be.
        const t = 1 - Math.exp(-Math.max(0, this.dragFollowSpeed) * dt);

        Vec3.lerp(this._swingPos, this._swingPos, this._swingAnchorPos, t);

        Vec3.subtract(this._swingOffset, this._swingPos, this._swingAnchorPos);
        const lag = this._swingOffset.length();
        if (lag > this.dragMaxLag && lag > 1e-6)
        {
            Vec3.multiplyScalar(this._swingOffset, this._swingOffset, this.dragMaxLag / lag);
            Vec3.add(this._swingPos, this._swingAnchorPos, this._swingOffset);
        }

        // The rig's own rotation is upright-plus-lean, so chasing it keeps the cube upright in the
        // world and lets the lag show up as a swing rather than as a tumble.
        Quat.multiply(this._swingAnchorRot, this.node.worldRotation, this._cubeBaseRot);
        Quat.slerp(this._swingRot, this._swingRot, this._swingAnchorRot, t);

        this.cubeNode.setWorldPosition(this._swingPos);
        this.cubeNode.setWorldRotation(this._swingRot);
    }

    /** How far, and which way, the bullet moved this frame - the flight's actual direction. */
    private measureMovement(): void
    {
        this.node.getWorldPosition(this._worldPosNow);

        if (this._hasPrevWorldPos)
        {
            Vec3.subtract(this._frameMove, this._worldPosNow, this._prevWorldPos);
        }
        else
        {
            this._frameMove.set(0, 0, 0);
            this._hasPrevWorldPos = true;
        }

        this._prevWorldPos.set(this._worldPosNow);
    }

    /**
     * Slerps `from` towards `to` by at most `speedDegrees` this frame, so a turn runs at a fixed
     * rate instead of one that depends on how far it happens to have to go. Returns true once it
     * has arrived.
     */
    private static stepRotation(out: Quat, from: Readonly<Quat>, to: Readonly<Quat>, speedDegrees: number, dt: number): boolean
    {
        const dot = Math.min(1, Math.abs(Quat.dot(from as Quat, to as Quat)));
        const remaining = 2 * Math.acos(dot);

        if (remaining < 1e-4)
        {
            out.set(to as Quat);
            return true;
        }

        const t = Math.min(1, ((speedDegrees * DEG_TO_RAD) * dt) / remaining);
        Quat.slerp(out, from as Quat, to as Quat, t);
        return t >= 1;
    }

    /** Aims the bee at `rotation`; update() walks it there at characterRotateSpeed. */
    private turnCharacterTo(rotation: Readonly<Quat>): void
    {
        this._targetRotation.set(rotation as Quat);
        this._isTurning = true;
    }

    protected update(dt: number): void
    {
        if (!this._isTurning || !this.characterRoot) return;

        const arrived = BulletItem.stepRotation(this._turnScratch, this.characterRoot.rotation, this._targetRotation, this.characterRotateSpeed, dt);
        this.characterRoot.setRotation(this._turnScratch);

        if (arrived) this._isTurning = false;
    }

    /**
     * Points the bullet down `outwardDir` - the direction the cube will be pulled out in. Uses the
     * same Quat.fromViewUp() as RotateToForwardVelocity, which is what lets the grip pose be
     * expressed against one fixed local axis (see cacheGripPose).
     */
    public faceOutward(outwardDir: Readonly<Vec3>): void
    {
        if (!outwardDir || outwardDir.lengthSqr() < 1e-8) return;

        Quat.fromViewUp(this._facing, outwardDir as Vec3);
        this.node.setWorldRotation(this._facing);
    }
}
