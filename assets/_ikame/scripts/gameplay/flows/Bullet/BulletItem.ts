import { _decorator, CCFloat, Component, MeshRenderer, Node, Quat, Vec3 } from 'cc';
import { RotateToForwardVelocity } from '../../../commons/RotateToForwardVelocity';
const { ccclass, property } = _decorator;

// Fallback names, used when the two nodes below are not wired up in the prefab.
const CHARACTER_NODE_NAME = 'Character';
const CUBE_NODE_NAME = 'PixelBlock-Bee';

const DEG_TO_RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;

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
    /** Hauling the cube away: the cube hangs off the bee's node, gravity lays the rig out. */
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
 * The moment the cube comes free it is REPARENTED under the bee, so from there on it is carried by
 * the scene graph and nothing in here touches its transform again. A per-frame chase (which is what
 * this used to do) cannot keep up with a bee that is easing through a long turn - it always trails
 * by however far the bee moved that frame, and on the slow rotation onto the exit climb that lag
 * reads as the cube coming unstuck. Parenting has no such error, and the swing that the chase was
 * there to sell is still produced by the bee's own eased turn from the grip pose back to upright.
 *
 * Where the bullet goes is not decided here - tweens elsewhere fly it along its path - but how
 * straight it flies is: on the two travelling beats a sine weave is laid on top of that path (see
 * applySway), so the bee wanders across its route the way one does instead of tracking a spline
 * like a missile. The two beats in the middle, where it has a face to hit and a cube to heave, get
 * the path exactly as given - and so do the run-ins to both ends of the flight, where the weave
 * unwinds onto the line as the target it was given for the leg comes up.
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

    @property({ type: CCFloat, tooltip: 'How quickly the bee slides back to its authored spot above the cube once it starts hauling, per second.' })
    public characterSettleSpeed: number = 8;

    @property({ type: CCFloat, tooltip: 'How far (world units) the bee weaves to either side of its flight path on the way in and on the way out. 0 flies dead straight.' })
    public swayAmplitude: number = 0.35;

    @property({ type: CCFloat, tooltip: 'Weaves per second. Higher is a busier, more insect-like flutter; lower is a lazy drift.' })
    public swayFrequency: number = 1.2;

    @property({ type: CCFloat, tooltip: 'Multiplies swayAmplitude while a cube is being hauled - a loaded bee should weave less than an empty one.' })
    public carrySwayScale: number = 0.5;

    @property({ type: CCFloat, tooltip: 'How near (world units) the end of the leg the bee stops weaving and starts straightening onto the path. Big enough to be settled before it arrives - roughly the last stretch of the flight.' })
    public swayFadeDistance: number = 2.5;

    @property({ type: CCFloat, tooltip: 'How quickly the weave straightens out once it is closing on the end of the leg, per second. Lower is a longer, lazier straightening.' })
    public swaySettleSpeed: number = 3;

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

    // The weave. It rides ON TOP of whatever is flying the bullet, so what is tracked here is the
    // path point underneath it (_swayBasePos) and the offset currently sitting on that point - the
    // tweens write the clean path every frame and know nothing about the weave.
    private readonly _swayBasePos = new Vec3();
    private readonly _swayOffset = new Vec3();
    private readonly _swayWrittenPos = new Vec3();
    private readonly _swayAxis = new Vec3(1, 0, 0);
    private readonly _swayScratch = new Vec3();
    private _swayPhase = 0;
    private _hasSway = false;

    // Where the current leg ends, which is where the weave has to be gone by. Held as a point in
    // some node's space rather than as a world position because neither end holds still: the
    // landing cell rides a rotating map, and the exit node can be moving.
    private _swaySpace: Node = null;
    private readonly _swayTargetPos = new Vec3();
    private readonly _swayTargetWorld = new Vec3();
    private _hasSwayTarget = false;
    // Latched once the straightening starts, so a leg that weaves can stop weaving but never take
    // it back up - which is what keeps the run-in to a face or an exit monotonically straighter.
    private _swayClosed = false;

    // Aims the bullet's forward down its velocity while it flies in; stood down from the landing
    // onwards, where the pose is driven from here instead.
    private _travelFacing: RotateToForwardVelocity = null;

    // The prefab's authored layout, captured once and restored on every release - a grab only ever
    // measures its changes against these, so repeated shots cannot drift.
    private readonly _cubeBaseScale = new Vec3(1, 1, 1);
    private readonly _cubeBasePos = new Vec3();
    private readonly _cubeBaseRot = new Quat();
    // How tall the cube being carried actually is in the world - the map's size once one has been
    // grabbed. Read from here rather than off the node, whose local scale stops meaning that the
    // moment the cube is parented under the bee.
    private _cubeSizeY = 1;
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
        // Fresh weave for the leg in; the shooter sets the face it ends on right after this.
        this.restartWeave();
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

        // Straight onto the face, from the path rather than from wherever the weave had swung to -
        // the standoff below is measured against the cell, so it has to start on it.
        this.clearSway();

        // From here the pose is ours; the travel-facing component would fight every write.
        if (this._travelFacing) this._travelFacing.enabled = false;

        this.faceOutward(outwardDir);

        if (!this.cubeNode || !this.characterRoot) return;

        this.cubeNode.setWorldScale(worldScale);
        this._cubeSizeY = worldScale.y;

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
     * The cube is out. It is handed to the bee's own node here - keeping its world transform, so
     * the handover is invisible - and from that point it is not touched again: the bee carries it
     * the way it carries any of its own parts, exactly, with no per-frame catching up to do.
     *
     * What is left to animate is only the bee: it turns from the grip pose back to the pose the
     * prefab gave it and slides back to its authored spot, and because the cube now rides along it
     * swings round underneath as that happens - which is the plug-out settling, for free. The
     * arrangement it lands in is the authored one: the bee holds the cube at the same distance it
     * gripped the face from, so undoing the grip rotation puts the cube exactly where the prefab
     * has it, under a bee that is back on top of it.
     *
     * From here gravity lays the whole rig out and movement tilts it - see carryUnderGravity().
     */
    public beginCarry(): void
    {
        this._phase = BulletPhase.Carry;

        // The face just left is no longer the thing to straighten up for; each leg of the way out
        // hands over its own end as it starts, and that restarts the weave with it.
        this.setSwayTarget(null, null);

        this.turnCharacterTo(this._characterBaseRot);

        if (this.cubeNode && this.characterRoot && this.cubeNode.parent !== this.characterRoot)
        {
            this.cubeNode.setParent(this.characterRoot, true);
        }
    }

    /** Empty-handed again - called as a bullet is fired, and once it is done with its cube. */
    public releaseCube(): void
    {
        this._phase = BulletPhase.Idle;

        if (this.cubeNode)
        {
            this.cubeNode.active = false;
            // Back off the bee and onto the bullet, where the prefab has it - a pooled bullet has
            // to come out of the pool arranged exactly as it was authored, whatever its last shot
            // left it holding.
            if (this.cubeNode.parent !== this.node) this.cubeNode.setParent(this.node, false);
            this.cubeNode.setScale(this._cubeBaseScale);
            this.cubeNode.setPosition(this._cubeBasePos);
            this.cubeNode.setRotation(this._cubeBaseRot);
        }
        this._cubeSizeY = this._cubeBaseScale.y;
        if (this.characterRoot)
        {
            this.characterRoot.setPosition(this._characterBasePos);
            this.characterRoot.setRotation(this._characterBaseRot);
        }

        this._isTurning = false;
        this._hasPrevWorldPos = false;
        this._leanDir.set(0, 0, 0);

        // Dropped where it is: a parked bullet is about to be moved to a muzzle anyway, so the
        // offset is only forgotten, not taken back off.
        this._swayOffset.set(0, 0, 0);
        this._hasSway = false;
        this.setSwayTarget(null, null);
        if (this._travelFacing) this._travelFacing.enabled = true;
    }

    public isCarryingCube(): boolean
    {
        return !!this.cubeNode && this.cubeNode.active;
    }

    //#endregion

    /**
     * The carry pose and the weave, run every frame the bullet is in the air.
     *
     * In lateUpdate() because the tweens that fly the bullet run during update() - this has to see
     * where the bullet actually ended up this frame, not where it was at the start of it, and the
     * weave has to be laid on top of that rather than be overwritten by it.
     */
    protected lateUpdate(dt: number): void
    {
        this.trackPathPosition();
        this.measureMovement();

        if (this._phase === BulletPhase.Carry) this.carryUnderGravity(dt);

        this.applySway(dt);
    }

    /**
     * Recovers the point on the flight path the bullet is really at, with this component's own
     * weave discounted.
     *
     * The tweens that fly the bullet write a clean path position every frame and know nothing about
     * the weave, so most frames the node simply is the path. But between legs, and through the
     * landing hover, nothing writes it at all - and there the node still carries the offset put
     * there last frame, which would be read back as path and offset again, and again. Hence the
     * check: a position that is still exactly what was written last frame is one nobody else has
     * touched, so the offset comes back off it.
     */
    private trackPathPosition(): void
    {
        this.node.getWorldPosition(this._worldPosNow);

        if (this._hasSway && Vec3.equals(this._worldPosNow, this._swayWrittenPos, 1e-5))
        {
            Vec3.subtract(this._swayBasePos, this._worldPosNow, this._swayOffset);
        }
        else
        {
            this._swayBasePos.set(this._worldPosNow);
        }
    }

    /**
     * Weaves the bullet from side to side of its path - a sine offset along the horizontal
     * perpendicular of its own heading, laid on top of the path position rather than replacing it,
     * so the tweens still decide where the flight goes and this only decides how straight it is
     * flown. A bee that tracks a spline exactly reads as a missile; the weave is what makes the
     * same path look flown.
     *
     * Only on the way in and on the way out. The plug-out is a short sharp heave along one axis and
     * a wobble there would fight it, and the landing has to hold still on the face it has picked -
     * so both of those get the path untouched, which is also why the offset is taken back off on
     * the frame the weave stops rather than being left baked into wherever the bee had drifted to.
     *
     * The phase restarts at each leg, where the sine is zero: the weave always begins from dead on
     * the path, so taking it up mid-flight never shows a step.
     *
     * It ends on the path too. Within swayFadeDistance of wherever the leg is going - the face
     * being landed on, the exit being flown to - the sine is dropped for good and the offset is
     * unwound to nothing instead (settleSwayToCentre), so the last stretch of every leg is flown
     * straight at what it is aiming for. Both ends of a flight have to be arrived at exactly.
     */
    private applySway(dt: number): void
    {
        const active = this._phase === BulletPhase.Approach || this._phase === BulletPhase.Carry;
        if (!active)
        {
            this.clearSway();
            return;
        }

        const amplitude = this.swayAmplitude * (this._phase === BulletPhase.Carry ? this.carrySwayScale : 1);

        if (!this._swayClosed && this.isClosingOnTarget()) this._swayClosed = true;

        // Closing on the end of the leg, or no weave asked for at all: straighten out and hold the
        // path, sine included - see settleSwayToCentre().
        if (this._swayClosed || Math.abs(amplitude) < 1e-5)
        {
            this.settleSwayToCentre(dt);
            return;
        }

        this._swayPhase = (this._swayPhase + this.swayFrequency * TWO_PI * dt) % TWO_PI;

        this.updateSwayAxis();
        Vec3.multiplyScalar(this._swayOffset, this._swayAxis, Math.sin(this._swayPhase) * amplitude);

        Vec3.add(this._swayWrittenPos, this._swayBasePos, this._swayOffset);
        this.node.setWorldPosition(this._swayWrittenPos);
        this._hasSway = true;
    }

    /**
     * Whether the bullet is near enough the end of this leg that the weave has to be got rid of.
     *
     * The target is a point in another node's space, not a world position, because neither end of a
     * flight holds still - the landing cell rides a map that is turning under it, and the exit node
     * can be moving - so it is resolved fresh every frame rather than measured once.
     */
    private isClosingOnTarget(): boolean
    {
        if (!this._hasSwayTarget || this.swayFadeDistance <= 0) return false;

        if (this._swaySpace)
        {
            if (!this._swaySpace.isValid) return false;
            Vec3.transformMat4(this._swayTargetWorld, this._swayTargetPos, this._swaySpace.worldMatrix);
        }
        else
        {
            this._swayTargetWorld.set(this._swayTargetPos);
        }

        return Vec3.squaredDistance(this._swayBasePos, this._swayTargetWorld) <= this.swayFadeDistance * this.swayFadeDistance;
    }

    /**
     * Straightens the bee onto its path for the run-in: the offset it is carrying is eased to zero
     * and the sine is left out of it entirely from here.
     *
     * Shrinking the sine's amplitude instead would keep swinging the bee through the middle on its
     * way down to nothing, which is the opposite of what the ends of a leg need - a face has to be
     * landed on square, and the exit has to be arrived at dead on. Easing the offset itself gives
     * one unwinding move onto the line and then nothing.
     */
    private settleSwayToCentre(dt: number): void
    {
        if (!this._hasSway) return;

        const t = 1 - Math.exp(-Math.max(0, this.swaySettleSpeed) * dt);
        Vec3.lerp(this._swayOffset, this._swayOffset, Vec3.ZERO, t);

        // Close enough to be on the line: stop writing, so the path owns the bullet outright again.
        if (this._swayOffset.lengthSqr() < 1e-8)
        {
            this.settleOnPath();
            return;
        }

        Vec3.add(this._swayWrittenPos, this._swayBasePos, this._swayOffset);
        this.node.setWorldPosition(this._swayWrittenPos);
    }

    /**
     * Where the leg being flown ends, as a point in `space`'s coordinates - pass a null space for a
     * point already in world coordinates, and a null point to say this leg has no end worth
     * straightening for. Set as each leg is started; the weave unwinds on its own approach to it.
     */
    public setSwayTarget(space: Node | null, position: Readonly<Vec3> | null): void
    {
        this._hasSwayTarget = !!position;
        this._swaySpace = position ? space : null;
        if (position) this._swayTargetPos.set(position as Vec3);

        this.restartWeave();
    }

    /**
     * Holds the bee on its path for the rest of this leg, unwinding whatever weave it is carrying
     * the same way an arrival does. For legs that have no room to wander at all - the corridor
     * through the pile is the one line clear of cubes, and its clearance is the cube's own width.
     */
    public holdSwayStraight(): void
    {
        this._swayClosed = true;
    }

    /**
     * Starts the weave over: back to the top of the sine, where it is zero, and free to weave again
     * after a leg that had straightened out. Being at zero is what makes it safe to call in the
     * middle of a flight - the offset it starts from is the one it already has.
     */
    private restartWeave(): void
    {
        this._swayPhase = 0;
        this._swayClosed = false;
    }

    /**
     * Puts the bullet back on its path and forgets the weave - what the beats that need the path
     * exact call before they start, so none of them inherits however far off it the weave had
     * drifted. Costs nothing when there is no weave on the node.
     */
    private clearSway(): void
    {
        if (!this._hasSway) return;

        // Re-read first: whatever flew the bullet may have moved it since the last frame, and it is
        // the path under the CURRENT position that has to be restored, not the last one seen.
        this.trackPathPosition();
        this.settleOnPath();
    }

    /** Drops the offset and puts the bullet on the path point that was last worked out. */
    private settleOnPath(): void
    {
        this._swayOffset.set(0, 0, 0);
        this._hasSway = false;
        this.node.setWorldPosition(this._swayBasePos);
        this._swayWrittenPos.set(this._swayBasePos);
    }

    /**
     * Which way is "sideways" right now: perpendicular to both the heading and world up, so the
     * weave is always across the flight and never along it or up out of it.
     *
     * A leg with no horizontal heading of its own - the straight climb on the way out - has no
     * sideways to speak of, so the last one that did is kept rather than snapping to some arbitrary
     * axis as the flight passes through vertical.
     */
    private updateSwayAxis(): void
    {
        const vertical = Vec3.dot(this._frameMove, Vec3.UP);
        this._swayScratch.set(
            this._frameMove.x - Vec3.UP.x * vertical,
            this._frameMove.y - Vec3.UP.y * vertical,
            this._frameMove.z - Vec3.UP.z * vertical,
        );

        if (this._swayScratch.lengthSqr() < 1e-10) return;

        this._swayScratch.normalize();
        Vec3.cross(this._swayScratch, this._swayScratch, Vec3.UP);

        if (this._swayScratch.lengthSqr() < 1e-10) return;

        this._swayScratch.normalize();
        this._swayAxis.set(this._swayScratch);
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
        const halfSize = this._cubeSizeY * 0.5;
        return Vec3.multiplyScalar(out, axis, halfSize + this._characterSurfaceGap + this.extraCharacterGap);
    }

    /**
     * How far, and which way, the bullet moved this frame - the flight's actual direction.
     *
     * Measured on the path, not on the swayed position, so the two things that read it back - the
     * carry lean and the weave's own sideways axis - see where the flight is going rather than
     * which way the weave happens to be swinging. A weave that steered itself would wander.
     */
    private measureMovement(): void
    {
        if (this._hasPrevWorldPos)
        {
            Vec3.subtract(this._frameMove, this._swayBasePos, this._prevWorldPos);
        }
        else
        {
            this._frameMove.set(0, 0, 0);
            this._hasPrevWorldPos = true;
        }

        this._prevWorldPos.set(this._swayBasePos);
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
