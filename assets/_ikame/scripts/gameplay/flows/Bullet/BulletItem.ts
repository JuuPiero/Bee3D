import { _decorator, CCFloat, Component, easing, MeshRenderer, Node, Quat, Vec3 } from 'cc';
import { RotateToForwardVelocity } from '../../../commons/RotateToForwardVelocity';
const { ccclass, property } = _decorator;

// Fallback names, used when the two nodes below are not wired up in the prefab.
const CHARACTER_NODE_NAME = 'Character';
const CUBE_NODE_NAME = 'PixelBlock-Bee';

const DEG_TO_RAD = Math.PI / 180;

// How many samples the weave's normalisation uses to find its own peak. Once per leg,
// so 32 is free, and the envelope is smooth enough that 32 lands within 0.005 of the
// true peak - measured against a 1000-sample sweep.
const WEAVE_PEAK_SAMPLES = 32;

// How far either side of weaveBias a leg's shape may be drawn, and the range that stays
// clear of starving either control to nothing.
const WEAVE_BIAS_SPREAD = 0.35;
const WEAVE_BIAS_MIN = 0.15;
const WEAVE_BIAS_MAX = 0.85;

// Offset left on the node at a landing above which something upstream is wrong - the
// envelope is zero at the end of a leg by construction, so there should be nothing to
// discard. See clearSway().
const LANDING_OFFSET_TOLERANCE = 0.01;

/** What the bee is doing right now, which is what decides who controls its pose. */
enum BulletPhase
{
    /** Parked in the pool, or flying empty-handed - nothing here touches the transform. */
    Idle,
    /** On its way to a cube, empty-handed and free to turn any way its heading goes. */
    Approach,
    /** Settled on the face it is about to pull, holding still for a beat before it heaves. */
    Landing,
    /** Heaving the cube out of the wall. Bee and cube are one rigid piece for this. */
    PlugOut,
    /** Hauling the cube away: the cube hangs off the bee's node, and the rig only ever yaws. */
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
 * one owns the pose differently, which is why the phase is explicit. Facing is the clearest case:
 * empty-handed on the way in the bee turns freely down its heading, the two beats at the cube are
 * held square to the face being pulled, and loaded on the way out it may only YAW - bee on top and
 * cube hanging below is the whole read of a load being carried, and any pitch or roll swings that
 * rig out sideways and breaks it.
 *
 * A flight arrives flying INWARD and leaves flying OUTWARD, so somewhere in it the bee has to turn
 * around. That happens on the way out, eased, and not on the face: the landing keeps the heading the
 * approach came in on (see faceForPull), so the beat where the bee is closest to the camera and
 * holding still is the one beat that never snaps. It backs out of the wall nose-in - which is what
 * heaving something free looks like - and swings round to face its exit as the haul gets going.
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

    @property({ type: CCFloat, tooltip: 'Degrees per second the bee itself turns onto the face it lands on, and back off it once the cube is free. Lower is lazier.' })
    public characterRotateSpeed: number = 220;

    @property({ type: CCFloat, tooltip: 'Degrees per second the bee turns onto its heading on the way in, where it is free to pitch as well as yaw. 0 snaps straight onto it.' })
    public travelTurnSpeed: number = 720;

    @property({ type: CCFloat, tooltip: 'Degrees per second the loaded bee yaws onto its heading on the way out. Lower than travelTurnSpeed reads as the weight of the cube. 0 snaps.' })
    public carryTurnSpeed: number = 220;

    @property({ type: CCFloat, tooltip: 'How quickly the bee slides back to its authored spot above the cube once it starts hauling, per second.' })
    public characterSettleSpeed: number = 8;

    @property({ type: CCFloat, tooltip: 'How near (world units) the cube the bee starts reaching into the grip it lands in, so it arrives already holding the face instead of jumping onto it. Roughly the last cube or two of the run-in. 0 puts it into the grip on the landing frame, which snaps.' })
    public gripReachDistance: number = 2;


    @property({ tooltip: 'Off flies every leg dead straight on the path the tweens write. Nothing about the flight logic changes - the fastest way to tell whether a problem is the weave or the path underneath it.' })
    public beeWeave: boolean = true;

    @property({ type: CCFloat, tooltip: 'How far (world units) the bee weaves to either side of its flight path on the way in and on the way out - the actual peak of the excursion, not a control magnitude. 0 flies dead straight.' })
    public swayAmplitude: number = 0.35;

    @property({ type: CCFloat, min: 0, max: 0.9, tooltip: 'Spread in the weave amplitude between one bee and the next, as a fraction: 0.25 means each flight draws somewhere in 0.75x-1.25x of swayAmplitude. 0 makes every bee weave exactly as far as every other.' })
    public weaveJitter: number = 0.25;

    @property({ type: CCFloat, min: 0.15, max: 0.85, tooltip: 'Where along the leg the weave leans, on average: below 0.5 peaks early (bee breaks away then straightens), above 0.5 peaks late. Each leg is drawn either side of this, so the value is the middle of a range, not a fixed shape.' })
    public weaveBias: number = 0.5;

    @property({ type: CCFloat, tooltip: 'Multiplies swayAmplitude while a cube is being hauled - a loaded bee should weave less than an empty one.' })
    public carrySwayScale: number = 0.5;

    @property({ type: CCFloat, tooltip: 'How near (world units) the end of the leg the bee stops weaving and starts straightening onto the path. Big enough to be settled before it arrives - roughly the last stretch of the flight.' })
    public swayFadeDistance: number = 2.5;

    @property({ type: CCFloat, tooltip: 'Fallback rate (per second) for straightening the weave onto the path, used only when nobody gave a deadline - i.e. the swayFadeDistance backstop. Beats that MUST be straight by their end pass their own length to holdSwayStraight() instead, so this value cannot make them wrong.' })
    public swaySettleSpeed: number = 3;

    private _phase: BulletPhase = BulletPhase.Idle;
    // LevelController owns the Unity-style launch/spread curve for the incoming open-air leg.
    // Suppress this component's sine weave during that one leg so the two trajectories never stack.
    private _approachWeaveSuppressed = false;

    private readonly _facing = new Quat();

    // Where the pull direction lands in the bullet's own space. landOnFace() aims the bullet along
    // the pull axis, so in its local frame the pull is always the same axis - which is why the grip
    // pose can be worked out once instead of per shot. Which way down that axis is not obvious: the
    // node is aimed nose-IN, so the outward pull is the far end of it (see cacheGripPose).
    private readonly _localOutAxis = new Vec3(0, 0, 1);
    private readonly _gripRotation = new Quat();

    private readonly _targetRotation = new Quat();
    private readonly _turnScratch = new Quat();
    private _isTurning = false;

    // Measured per frame, so the pose answers to the flight's actual direction rather than to
    // whichever leg happens to be running. Two of them, because the weave makes the difference
    // matter: _frameMove is movement along the PATH, which is what the weave takes its own sideways
    // axis from (reading its own output back would make it wander); _renderMove is movement as
    // FLOWN, weave included, which is what the bee is pointed down.
    private readonly _worldPosNow = new Vec3();
    private readonly _prevWorldPos = new Vec3();
    private readonly _frameMove = new Vec3();
    private _hasPrevWorldPos = false;
    private readonly _prevRenderPos = new Vec3();
    private readonly _renderMove = new Vec3();
    private _hasPrevRenderPos = false;
    private readonly _travelDir = new Vec3();
    private readonly _poseScratch = new Quat();

    // Set by the beat that knows the bee's movement this frame says nothing about where it is
    // going, so facing HOLDS instead of turning. Cleared by the first frame of real travel.
    //
    // A flag rather than a speed threshold, deliberately. The beat this exists for is the pop at
    // beginCarry: a short shove along the extract normal, at a speed of the same order as the
    // corridor run that follows it, and pointing somewhere else entirely. The Unity build tried to
    // separate its equivalent by magnitude and measured the two beats at 18.3 and 26 units/second -
    // close enough that no threshold splits them. Whoever starts the beat knows; the facing does not.
    private _facingHeld = false;

    // The weave. It rides ON TOP of whatever is flying the bullet, so what is tracked here is the
    // path point underneath it (_swayBasePos) and the offset currently sitting on that point - the
    // tweens write the clean path every frame and know nothing about the weave.
    private readonly _swayBasePos = new Vec3();
    private readonly _swayOffset = new Vec3();
    private readonly _swayWrittenPos = new Vec3();
    private readonly _swayAxis = new Vec3(1, 0, 0);
    private readonly _swayScratch = new Vec3();
    private _hasSway = false;

    // The weave's shape for the leg being flown: two control weights on ONE shared
    // sideways axis, already carrying the leg's sign and already normalised so the
    // envelope peaks at exactly 1. Amplitude is applied per frame instead of being baked
    // in here, because it changes with the phase (carrySwayScale) while the shape does not.
    //
    // Same side by construction - see drawWeaveShape().
    private _weaveShapeA = 0;
    private _weaveShapeB = 0;
    // Per-FLIGHT (not per-leg) amplitude scale, so one bee weaves further than the next.
    private _weaveScale = 1;
    // The sideways axis, latched on the first frame of the leg that has usable movement.
    // Re-deriving it per frame would make the offset steer itself; a curve needs a frame
    // that holds still for the length of the leg it is drawn across.
    private _hasWeaveAxis = false;

    // How long the leg is and how much of it has been covered. Shared with growCharacter
    // rather than measured twice - both want "how far is there still to go", and two
    // latches of the same number are two things to drift apart.
    private _legDistance = 0;
    private _legProgress = 0;

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

    // The straightening deadline, when the beat that asked for it gave one: how long it has, how much
    // of that has passed, and the offset it started from. Duration 0 means no deadline was given and
    // the swaySettleSpeed rate is used instead. See holdSwayStraight().
    private _straightenDuration = 0;
    private _straightenElapsed = 0;
    private readonly _straightenFrom = new Vec3();

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
    private readonly _characterBaseScale = new Vec3(1, 1, 1);
    // How much bigger the cube the map draws is than the one the prefab was authored around, and the
    // bee's own scale with that applied. One ratio for all three axes: a bee is a shape, not a box,
    // and matching a non-uniform cube per-axis would shear it.
    private _cubeScaleRatio = 1;
    private readonly _characterTargetScale = new Vec3(1, 1, 1);
    private readonly _characterScale = new Vec3(1, 1, 1);
    // The resize is a curve, not a rate, so it needs progress from 0 to 1 to have a shape at all -
    // and the trip in is what that progress is measured on: how much of the way from the muzzle to
    // the cell has been covered, taken off the distance still to go. The whole distance is latched on
    // the first frame there is a cell to measure to, and the progress only ever climbs, so a flight
    // that eddies about on its way in cannot walk the curve backwards.
    private _characterResizing = false;
    private _growProgress = 0;
    // Distance still to fly to the end of this leg, and whether there was a leg to measure
    // at all (< 0 means no target has resolved yet). Worked out once per frame in
    // updateLegProgress() and read by everything that paces off it - the weave, the resize
    // and the grip reach - rather than each of them resolving a moving target of its own.
    private _legRemaining = -1;
    // Which way the bee sits from the cube in the prefab (usually straight up), and how far past
    // the cube's own surface that puts it. Both are what a landing re-applies along the pull axis.
    private readonly _characterBaseDir = new Vec3(0, 1, 0);
    private _characterSurfaceGap = 0;

    private readonly _characterPos = new Vec3();
    private readonly _characterRestPos = new Vec3();
    // The grip, blended into over the run-in. Both ends are constants in the bullet's own space - the
    // authored spot the bee flies at, and the standoff on the pull axis - so the reach can start
    // before the pull direction is known, which is what lets it be spread over the run-in at all.
    private readonly _gripPos = new Vec3();
    private readonly _gripScratch = new Quat();

    @property([MeshRenderer]) private mainRenderers: MeshRenderer[] = [];

    protected onLoad(): void
    {
        if (!this.characterRoot) this.characterRoot = this.node.getChildByName(CHARACTER_NODE_NAME);
        if (!this.cubeNode) this.cubeNode = this.node.getChildByName(CUBE_NODE_NAME);

        // Facing is owned here now, for every beat of the flight, so the shared component is stood
        // down for good rather than toggled per phase. It sampled the position in update(), which
        // is before the tweens move the bullet, so what it aimed down was always a frame stale -
        // and its authored rotateSpeed made the catching-up slower still, which is why the bee flew
        // pointing somewhere other than where it was going. faceAlongTravel() reads the movement
        // after it has happened, and per phase decides how much freedom that facing gets.
        const travelFacing = this.getComponent(RotateToForwardVelocity);
        if (travelFacing) travelFacing.enabled = false;

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
            this._characterBaseScale.set(this.characterRoot.scale);
            this._characterTargetScale.set(this.characterRoot.scale);

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
     *
     * What the landing hands that call is the INWARD heading, not the pull, so the axis worked out
     * from the probe points into the wall and the outward side - the side the bee has to grip from -
     * is the other end of it. Hence the negate: everything downstream, the grip pose here and the
     * standoff in standoffAlong(), is expressed against "outward in local space" and so comes out
     * right whichever way round the node itself is aimed.
     */
    private cacheGripPose(): void
    {
        const probe = new Vec3(0, 0, 1);
        const probeFacing = new Quat();
        Quat.fromViewUp(probeFacing, probe);
        Quat.invert(probeFacing, probeFacing);
        Vec3.transformQuat(this._localOutAxis, probe, probeFacing);
        this._localOutAxis.normalize();
        Vec3.negate(this._localOutAxis, this._localOutAxis);

        Quat.rotationTo(this._gripRotation, this._characterBaseDir, this._localOutAxis);
        Quat.multiply(this._gripRotation, this._gripRotation, this._characterBaseRot);
    }

    //#region phases

    /**
     * Leaves the muzzle empty-handed and flying nose-first. Called as the shot is fired.
     *
     * `cubeWorldScale` is the size the map draws its cubes at, if the caller knows it yet. Knowing it
     * this early is what lets the flight in do its own preparing: the bee grows onto that size across
     * the trip (see growCharacter), and the standoff it will grip at - which is measured off that
     * size - is known too, so it can reach into the grip before it gets there (see reachForGrip).
     * Pass nothing and both wait for the landing, which is the same pose arrived at in one frame.
     */
    public beginApproach(cubeWorldScale: Readonly<Vec3> | null = null): void
    {
        this.releaseCube();
        this._phase = BulletPhase.Approach;
        // Fresh weave for the leg in; the shooter sets the face it ends on right after this.
        this.restartWeave();

        // Drawn once per FLIGHT, not per leg: this is "how far does THIS bee weave", so it has to
        // stay the same from the muzzle to the exit. Per-leg amplitude jitter would read as the same
        // bee changing its mind, which is not what varies between real ones.
        this._weaveScale = 1 + (Math.random() * 2 - 1) * Math.max(0, this.weaveJitter);

        // After releaseCube(), which is what puts the bee back at its authored size and spot - the
        // near end of both blends, so they have to be where it actually is.
        if (cubeWorldScale)
        {
            this.aimCharacterScaleAt(cubeWorldScale);
            this._cubeSizeY = cubeWorldScale.y;
            this._characterResizing = true;
            this._growProgress = 0;
        }
    }

    /** Temporarily disables only the procedural weave while a controller supplies its own path. */
    public setApproachWeaveSuppressed(suppressed: boolean): void
    {
        this._approachWeaveSuppressed = suppressed;
        if (suppressed) this.clearSway();
    }

    /**
     * Works out the size the bee has to end up at to sit right against the cube it is fetching.
     *
     * The map draws its cubes at whatever its fit scale works out to, which is not the size the
     * prefab was authored around - the stand-in is already resized per shot for exactly that reason
     * (see landOnFace), and this is the same correction carried across to the bee, so the pair keeps
     * the proportions it was authored with instead of a bee hauling a cube twice its size.
     *
     * The ratio is kept, not just the scale, because the arrangement scales too: the gap the prefab
     * leaves between bee and cube face is part of the same picture, and standoffAlong() grows it by
     * this ratio so a bigger rig does not sit tighter than the authored one.
     */
    private aimCharacterScaleAt(cubeWorldScale: Readonly<Vec3>): void
    {
        const authored = this._cubeBaseScale.y;
        this._cubeScaleRatio = Math.abs(authored) > 1e-6 ? cubeWorldScale.y / authored : 1;

        Vec3.multiplyScalar(this._characterTargetScale, this._characterBaseScale, this._cubeScaleRatio);
    }

    /**
     * Lands on the face the cube will be pulled out of: the bullet is squared up to the pull axis
     * (nose-in, holding the approach heading - see faceForPull) and the bee is put on that face,
     * standing off it by the cube's half-size plus the prefab's own gap.
     *
     * Both halves of that grip pose are arrived at rather than snapped into. The run-in has already
     * blended the bee most of the way into it (see reachForGrip), so the position set here is the last
     * hair of a move that has been happening for a stretch, and the turn is handed to the eased one in
     * update() rather than written. Nothing about the pose changes on this frame alone.
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

        this.faceForPull(outwardDir);

        if (!this.cubeNode || !this.characterRoot) return;

        this.cubeNode.setWorldScale(worldScale);
        this._cubeSizeY = worldScale.y;

        // Whatever the flight in did not finish growing, taken exactly here: this is the size the
        // standoff below is measured against, and it is the authority on it either way - a shot that
        // was fired without a cube size to aim at gets its only sizing on this line.
        this.aimCharacterScaleAt(worldScale);
        this.applyTargetScale();

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
    public grabCube(): void
    {
        this._phase = BulletPhase.PlugOut;

        if (!this.cubeNode) return;

        this.cubeNode.active = true;
        this.setColor(this.colorBytes, this.shadowBytes);
    }

    private colorBytes: Uint8Array = new Uint8Array(4);
    private shadowBytes: Uint8Array = new Uint8Array(4); 

 
    public setColor(colorBytes: Uint8Array, shadowBytes: Uint8Array): void
    {
        this.colorBytes = colorBytes;
        this.shadowBytes = shadowBytes;

        for (const renderer of this.mainRenderers) {
            renderer.setInstancedAttribute('a_instColor', this.colorBytes);
            renderer.setInstancedAttribute('a_instColorShadow', this.shadowBytes);
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
     * From here the rig stays upright and only turns about world up - see faceAlongTravel().
     */
    public beginCarry(): void
    {
        this._approachWeaveSuppressed = false;
        this._phase = BulletPhase.Carry;

        // The pop that just ran was a shove along the extract normal, not travel. This is the first
        // frame Carry lets faceAlongTravel run, so without the hold the bee would yaw onto the
        // pop's heading - which points out of the wall, not down the corridor it is about to fly.
        this.holdFacing();

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
        this._approachWeaveSuppressed = false;
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
        this._cubeScaleRatio = 1;
        this._characterTargetScale.set(this._characterBaseScale);
        this._characterResizing = false;
        this._growProgress = 0;
        if (this.characterRoot)
        {
            this.characterRoot.setPosition(this._characterBasePos);
            this.characterRoot.setRotation(this._characterBaseRot);
            this.characterRoot.setScale(this._characterBaseScale);
        }

        this._isTurning = false;
        this._hasPrevWorldPos = false;
        this._hasPrevRenderPos = false;
        this._renderMove.set(0, 0, 0);
        this._facingHeld = false;
        this._weaveScale = 1;

        // Dropped where it is: a parked bullet is about to be moved to a muzzle anyway, so the
        // offset is only forgotten, not taken back off. Cleared directly rather than through
        // clearSway(), which would warn about an offset that is being abandoned on purpose.
        this._swayOffset.set(0, 0, 0);
        this._hasSway = false;
        this.setSwayTarget(null, null);
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
        this.updateLegProgress();

        // The weave first, then the facing off the back of it: the bee is pointed down the flight
        // it has just been given, this frame, rather than down the one it made last frame.
        this.applySway(dt);
        this.measureRenderMovement();

        if (this._phase === BulletPhase.Approach || this._phase === BulletPhase.Carry)
        {
            this.faceAlongTravel(dt);
        }

        if (this._phase === BulletPhase.Approach) this.updateApproachPose();

        if (this._phase === BulletPhase.Carry) this.settleCharacter(dt);
    }

    /**
     * How far there is still to fly on this leg, and how much of it is behind - resolved once per
     * frame, off the PATH position rather than the woven one, so everything paced by the trip
     * agrees about where the bee is.
     *
     * The leg's whole length is latched on the first frame a target resolves, and progress only
     * ever climbs, so a flight that eddies about on its way in cannot walk any of the curves this
     * drives backwards. Resolved here once rather than by each consumer, which is also what stops
     * the moving target from being transformed three times a frame.
     */
    private updateLegProgress(): void
    {
        if (!this.resolveSwayTarget())
        {
            this._legRemaining = -1;
            return;
        }

        const remaining = Vec3.distance(this._swayBasePos, this._swayTargetWorld);
        this._legRemaining = remaining;

        if (this._legDistance <= 0) this._legDistance = remaining;
        if (this._legDistance <= 1e-4) return;

        const covered = 1 - remaining / this._legDistance;
        this._legProgress = Math.min(1, Math.max(this._legProgress, covered));
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
     * Weaves the bullet off the side of its path - laid on top of the path position rather than
     * replacing it, so the tweens still decide where the flight goes and this only decides how
     * straight it is flown. A bee that tracks a spline exactly reads as a missile.
     *
     * ONE ARC PER LEG, NOT AN OSCILLATION. This used to be a sine: amplitude times
     * sin(swayFrequency * t), which is the shape the Unity build of this game shipped, played, and
     * threw out - a sine has a period, so on any leg long enough to show more than one hump the
     * repetition is the first thing the eye finds. What replaced it there, and here, is a single
     * random arc per leg: two control weights on one shared sideways axis, blended by the two
     * middle cubic Bernstein terms (see weaveOffsetAt), so the bee breaks away from its line once
     * and comes back to it.
     *
     * Three things fall out of that shape for free, each of which the sine needed extra machinery
     * for:
     *  - it is zero at both ends of the leg by construction, so a leg is entered and left ON the
     *    path. swayFadeDistance is now a backstop for legs cut short, not the mechanism.
     *  - it cannot be caught mid-swing by a phase change, which is what made the old landing snap.
     *  - every leg gets a different shape, not the same shape at a different offset.
     *
     * Only on the way in and on the way out. The plug-out is a short sharp heave along one axis and
     * a wobble there would fight it, and the landing has to hold still on the face it has picked -
     * so both of those get the path untouched.
     */
    private applySway(dt: number): void
    {
        const active = this._phase === BulletPhase.Approach || this._phase === BulletPhase.Carry;
        if (!active)
        {
            this.clearSway();
            return;
        }

        const amplitude = this.swayAmplitude
            * (this._phase === BulletPhase.Carry ? this.carrySwayScale : 1)
            * this._weaveScale;

        if (!this._swayClosed && this.isClosingOnTarget()) this._swayClosed = true;

        // Straighten out and hold the path: told to (holdSwayStraight, and the corridor legs do),
        // switched off, no amplitude asked for, or too near the end of a leg that was cut short.
        if (this._swayClosed || this._approachWeaveSuppressed || !this.beeWeave || Math.abs(amplitude) < 1e-5)
        {
            this.settleSwayToCentre(dt);
            return;
        }

        // No leg to measure against - the target is set just after the shot, and the exit leg sets
        // its own. Without a length there is no progress along the arc, and guessing one would put
        // the bee somewhere the curve does not describe. Hold the path until there is one.
        if (this._legRemaining < 0 || this._legDistance <= 1e-4)
        {
            this.settleSwayToCentre(dt);
            return;
        }

        // The axis has to hold still for the length of the leg the arc is drawn across, so it is
        // latched on the first frame with usable movement rather than re-derived per frame.
        if (!this._hasWeaveAxis)
        {
            if (!this.latchWeaveAxis())
            {
                this.settleSwayToCentre(dt);
                return;
            }
            this.drawWeaveShape();
        }

        const envelope = BulletItem.weaveOffsetAt(this._legProgress, this._weaveShapeA, this._weaveShapeB);
        Vec3.multiplyScalar(this._swayOffset, this._swayAxis, envelope * amplitude);

        Vec3.add(this._swayWrittenPos, this._swayBasePos, this._swayOffset);
        this.node.setWorldPosition(this._swayWrittenPos);
        this._hasSway = true;
    }

    /**
     * The weave envelope: the two middle terms of a cubic Bezier, which is a single lobe that is
     * exactly zero at t=0 and t=1 whatever the two weights are.
     *
     * The two outer terms are left out deliberately - they are the ones carrying the endpoints, and
     * the endpoints of this curve have to be zero. What is left is the deviation alone.
     */
    private static weaveOffsetAt(t: number, a: number, b: number): number
    {
        const u = 1 - t;
        return 3 * u * u * t * a + 3 * u * t * t * b;
    }

    /**
     * Draws the shape of this leg's arc: a side, and two control weights on it.
     *
     * BOTH WEIGHTS GET THE SAME SIGN. Opposite signs make the envelope cross zero in the middle -
     * an S rather than an arc - and an S is a wobble, which is the periodic read this shape exists
     * to remove. (In the Unity build it was worse than cosmetic: measured minimum clearance to the
     * structure dropped from 4.49 to 0.34 because the S cut back through the middle. Here the
     * corridor guarantees clearance, so only the look is at stake.)
     *
     * The RATIO between the weights is drawn per leg, not fixed, and this is not decoration: with a
     * fixed ratio the lobe peaks at the same point on every leg - swept it, 0.535 every single draw
     * - so every bee flew one curve at different sizes. Drawing the ratio moves where the arc leans,
     * which is what makes two bees on the same route look like two bees.
     *
     * Then normalised so the envelope peaks at exactly 1, which is what lets swayAmplitude mean
     * "how far the bee weaves" rather than "a control weight". Unnormalised, the Bernstein terms cap
     * at 4/9 each and an authored 0.35 came out as a 0.22 excursion - the knob quietly meaning about
     * 60% of what it said.
     */
    private drawWeaveShape(): void
    {
        const side = Math.random() < 0.5 ? -1 : 1;

        let bias = this.weaveBias + (Math.random() * 2 - 1) * WEAVE_BIAS_SPREAD;
        bias = Math.min(WEAVE_BIAS_MAX, Math.max(WEAVE_BIAS_MIN, bias));

        const shapeA = bias;
        const shapeB = 1 - bias;

        let peak = 0;
        for (let i = 0; i <= WEAVE_PEAK_SAMPLES; i++)
        {
            const value = Math.abs(BulletItem.weaveOffsetAt(i / WEAVE_PEAK_SAMPLES, shapeA, shapeB));
            if (value > peak) peak = value;
        }

        const norm = peak > 1e-6 ? side / peak : 0;
        this._weaveShapeA = shapeA * norm;
        this._weaveShapeB = shapeB * norm;
    }

    /**
     * Whether the bullet is near enough the end of this leg that the weave has to be got rid of.
     *
     * A backstop now rather than the way legs end: the arc is already zero at the end of a full
     * leg. What this still catches is a leg cut short - handed a new target part-way, or ended by a
     * phase change - where progress never reached 1 and there is an offset left standing.
     */
    private isClosingOnTarget(): boolean
    {
        if (this.swayFadeDistance <= 0) return false;
        if (this._legRemaining < 0) return false;

        return this._legRemaining <= this.swayFadeDistance;
    }

    /**
     * Puts where this leg ends into `_swayTargetWorld`, and says whether there was one to put there.
     *
     * Split out because the weave is no longer the only thing that wants it: the resize on the way in
     * is paced by how far there is still to fly (see growCharacter), and both want the same
     * once-per-frame resolve of a point that is held in a moving node's space.
     */
    private resolveSwayTarget(): boolean
    {
        if (!this._hasSwayTarget) return false;

        if (this._swaySpace)
        {
            if (!this._swaySpace.isValid) return false;
            Vec3.transformMat4(this._swayTargetWorld, this._swayTargetPos, this._swaySpace.worldMatrix);
        }
        else
        {
            this._swayTargetWorld.set(this._swayTargetPos);
        }

        return true;
    }

    /**
     * Straightens the bee onto its path: the offset it is carrying is eased to zero and the arc is
     * left out of it entirely from here.
     *
     * Shrinking the arc's amplitude instead would keep swinging the bee through the middle on its way
     * down to nothing, which is the opposite of what the ends of a leg need - a face has to be landed
     * on square, and the exit has to be arrived at dead on. Easing the offset itself gives one
     * unwinding move onto the line and then nothing.
     *
     * Two modes, and the difference matters (see holdSwayStraight):
     *  - DEADLINE, when the beat said how long it has: interpolated off the offset held when the beat
     *    began, so it reaches exactly zero at the deadline. Frame-rate independent and not tunable
     *    into being wrong.
     *  - RATE, the swayFadeDistance backstop: exponential at swaySettleSpeed, which approaches zero
     *    without a promise about when.
     */
    private settleSwayToCentre(dt: number): void
    {
        if (!this._hasSway) return;

        if (this._straightenDuration > 0)
        {
            this._straightenElapsed += dt;
            const k = Math.min(1, this._straightenElapsed / this._straightenDuration);

            if (k >= 1)
            {
                this.settleOnPath();
                return;
            }

            // Eased so it lets go of the offset gently rather than yanking off it at full rate on the
            // first frame; still exactly zero at k = 1, which is the whole point of the deadline.
            Vec3.multiplyScalar(this._swayOffset, this._straightenFrom, 1 - easing.cubicOut(k));
        }
        else
        {
            const t = 1 - Math.exp(-Math.max(0, this.swaySettleSpeed) * dt);
            Vec3.lerp(this._swayOffset, this._swayOffset, Vec3.ZERO, t);
        }

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
     * Holds the bee on its path for the rest of this leg, unwinding whatever weave it is carrying.
     * For legs that have no room to wander at all - the corridor through the pile is the one line
     * clear of cubes, and its clearance is the cube's own width.
     *
     * PASS THE BEAT'S OWN LENGTH. With a deadline the offset is guaranteed to be exactly zero by the
     * time that many seconds have passed, whatever the frame rate and whatever the inspector says.
     * Without one it falls back to swaySettleSpeed, which is a rate, and a rate can always be too
     * slow for the beat that needs it.
     *
     * That is not hypothetical: this shipped rate-only, and the rate that was actually serialised
     * into the bullet prefab (3/s, the old default - editing the default in code does NOT change an
     * authored prefab) left 0.047 units of offset standing at the landing, which the landing then
     * snapped off. The beat knows how long it has; the component cannot.
     */
    public holdSwayStraight(overSeconds: number = 0): void
    {
        this._swayClosed = true;

        if (overSeconds > 0)
        {
            this._straightenDuration = overSeconds;
            this._straightenElapsed = 0;
            this._straightenFrom.set(this._swayOffset);
        }
        else
        {
            this._straightenDuration = 0;
        }
    }

    /**
     * Stops the bee turning until it is genuinely travelling again, and forgets the movement it has
     * just made so the release cannot read it - call at the start of any beat that moves the bullet
     * somewhere other than where it is heading. See _facingHeld.
     */
    public holdFacing(): void
    {
        this._facingHeld = true;
        this._hasPrevRenderPos = false;
        this._renderMove.set(0, 0, 0);
    }

    /**
     * Starts a new leg: forget the arc the last one was flying and re-measure the trip, so the next
     * one draws its own shape over its own length. Free to weave again after a leg that had
     * straightened out.
     *
     * Safe mid-flight because the new arc starts at zero, which is where a leg that ran to its end
     * already left the bee. The one that is not safe is restarting a leg the bee is part-way off
     * the line on - hence the check in clearSway().
     */
    private restartWeave(): void
    {
        this._swayClosed = false;
        this._straightenDuration = 0;
        this._hasWeaveAxis = false;
        this._legDistance = 0;
        this._legProgress = 0;
        this._legRemaining = -1;
    }

    /**
     * Puts the bullet back on its path and forgets the weave - what the beats that need the path
     * exact call before they start, so none of them inherits however far off it the weave had
     * drifted. Costs nothing when there is no weave on the node.
     *
     * This is a SNAP, and it is meant to be: the standoff a landing measures has to start from the
     * cell, not from wherever the bee had drifted to. What makes it safe is that the arc is already
     * zero by the end of a leg, so there is nothing left to discard - and what makes that checkable
     * is the warning below. The same snap over a sine offset is a visible teleport of up to a full
     * amplitude, which is exactly how the Unity build of this shipped it: their bees jumped on
     * arrival for weeks because the snap was silent and the offset was never zero.
     */
    private clearSway(): void
    {
        if (!this._hasSway) return;

        const stranded = this._swayOffset.length();
        if (stranded > LANDING_OFFSET_TOLERANCE)
        {
            // Not a rounding problem: either the leg length was wrong, or its target never
            // resolved, or a phase cut the leg short before the arc came back to the line. Raising
            // the tolerance hides it rather than fixing it.
            console.warn(`[BulletItem] weave offset ${stranded.toFixed(3)} discarded on a beat that needs the path exact - the arc should be back on the line by the end of its leg.`);
        }

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
     * Fixes which way is "sideways" for this whole leg: perpendicular to both the heading and world
     * up, so the arc is across the flight and never along it or up out of it. Returns whether there
     * was a heading to take one from.
     *
     * Latched once per leg rather than tracked per frame. A curve drawn against an axis that keeps
     * turning is not the curve that was drawn - and worse, the offset would start steering itself:
     * the frame turns as the bee is pushed sideways, so next frame's "sideways" is measured off a
     * heading this offset bent. Taking it off _frameMove (movement along the PATH, weave excluded)
     * rather than _renderMove is the same guard one step earlier.
     *
     * A leg with no horizontal heading at all - the straight climb on the way out - has no sideways
     * to speak of, and gets no weave until it leans over enough to have one.
     */
    private latchWeaveAxis(): boolean
    {
        const vertical = Vec3.dot(this._frameMove, Vec3.UP);
        this._swayScratch.set(
            this._frameMove.x - Vec3.UP.x * vertical,
            this._frameMove.y - Vec3.UP.y * vertical,
            this._frameMove.z - Vec3.UP.z * vertical,
        );

        if (this._swayScratch.lengthSqr() < 1e-10) return false;

        this._swayScratch.normalize();
        Vec3.cross(this._swayScratch, this._swayScratch, Vec3.UP);

        if (this._swayScratch.lengthSqr() < 1e-10) return false;

        this._swayScratch.normalize();
        this._swayAxis.set(this._swayScratch);
        this._hasWeaveAxis = true;
        return true;
    }

    /**
     * Points the bullet down the way it is actually moving - measured AFTER the weave has been
     * applied, so what is faced is the real path through the air rather than the line underneath
     * it, and the bee noses into its own wander instead of sliding across it sideways.
     *
     * The two travelling beats want different freedoms:
     *
     * - On the way in, free. An empty bee darts, and a dive down into the pile should read as a
     *   dive - pitch and all - so the facing is simply the travel direction.
     *
     * - On the way out, yaw only, about WORLD up. There is a cube hanging under the bee now, and
     *   the whole layout of that rig is "bee on top, cube below" - any pitch or roll swings the
     *   load out sideways and it stops reading as weight being carried. So only the horizontal part
     *   of the heading is faced, which by construction is a turn about world Y and nothing else:
     *   Quat.fromViewUp() of a direction that is already perpendicular to up can only yaw.
     *
     *   This is also where the flight turns around. The bee lands and heaves nose-in, so the first
     *   thing this yaws it through on the way out is the half-turn onto its exit - eased at
     *   carryTurnSpeed, over a bee that is already moving, with the cube swinging round under it.
     *
     * World rotation in both cases, not local - through the pile the bullet is parented to the
     * holder the map turns with, and neither "which way am I going" nor "which way is up" turns
     * with the level.
     */
    private faceAlongTravel(dt: number): void
    {
        // Held through a beat whose movement is not travel - see _facingHeld. holdFacing() threw
        // away the movement history, so _renderMove reads zero until the NEXT leg has written two
        // positions of its own; the first non-zero reading is therefore the new leg's, and it is
        // safe to face.
        if (this._facingHeld)
        {
            if (this._renderMove.lengthSqr() < 1e-8) return;
            this._facingHeld = false;
        }

        this._travelDir.set(this._renderMove);

        // Yaw only for the carry: flatten the heading before it is faced.
        if (this._phase === BulletPhase.Carry)
        {
            const vertical = Vec3.dot(this._travelDir, Vec3.UP);
            this._travelDir.set(
                this._travelDir.x - Vec3.UP.x * vertical,
                this._travelDir.y - Vec3.UP.y * vertical,
                this._travelDir.z - Vec3.UP.z * vertical,
            );
        }

        // Too little movement to read a direction off - a straight climb has no yaw of its own, and
        // guessing one would spin the load. Hold whatever is being faced.
        if (this._travelDir.lengthSqr() < 1e-10) return;

        this._travelDir.normalize();

        // Dead vertical has no sideways to build a basis from, and Quat.fromViewUp() answers that
        // with the identity rotation - which would snap the bee to an unrelated pose part-way up a
        // climb. Hold the last good facing through it; the flight comes off vertical soon enough.
        if (Math.abs(Vec3.dot(this._travelDir, Vec3.UP)) > 0.9995) return;

        Quat.fromViewUp(this._poseScratch, this._travelDir);

        const turnSpeed = this._phase === BulletPhase.Carry ? this.carryTurnSpeed : this.travelTurnSpeed;
        if (turnSpeed <= 0)
        {
            this.node.setWorldRotation(this._poseScratch);
            return;
        }

        BulletItem.stepRotation(this._turnScratch, this.node.worldRotation, this._poseScratch, turnSpeed, dt);
        this.node.setWorldRotation(this._turnScratch);
    }

    /**
     * Everything the bee does to itself on the way in - resize itself, then reach into its grip.
     *
     * Both are paced off the same number, how far there is still to fly to the cell - measured once
     * per frame by updateLegProgress(), which the weave paces off too. And they are deliberately
     * laid out end to end along it rather than run on top of each other: the resize finishes where
     * the reach begins (gripReachDistance from the cube), so the last stretch of a flight has one
     * thing changing at a time. Two changes landing together on the frames the bee is largest and
     * slowing down is what reads as a snap, however smooth either of them is on its own.
     */
    private updateApproachPose(): void
    {
        if (!this.characterRoot) return;

        // Nothing to measure against yet - the cell it is going to is set just after the shot.
        if (this._legRemaining < 0) return;

        this.growCharacter(this._legRemaining);
        this.reachForGrip(this._legRemaining);
    }

    /**
     * Grows the bee onto the size of the cube it is flying at, across the flight in.
     *
     * Spread over the trip rather than set at the muzzle because that is where the shot is at its
     * biggest and nearest the camera: a size correction taken there is a visible pop on every shot,
     * where the same correction spread over the way in is a change nobody reads.
     *
     * The trip is the timing - there is no duration to author. Progress is how much of the distance
     * from the muzzle to the cell has been covered, so a long shot resizes over a long flight and a
     * short one over a short flight. Distance rather than elapsed time because the flight is not one
     * tween and does not hold one speed - it arcs, then runs the corridor - and what the resize has
     * to be finished by is a place, not a clock.
     *
     * That place is where the reach starts, not the cube: the last stretch belongs to the grip (see
     * updateApproachPose), so the size is settled before the bee gets there. Progress only ever
     * climbs, so a flight that eddies about on its way in cannot walk the curve backwards.
     */
    private growCharacter(remaining: number): void
    {
        if (!this._characterResizing) return;

        // Done by the time the reach begins, so the two never overlap.
        const margin = Math.max(0, this.gripReachDistance);
        const trip = this._legDistance - margin;

        if (trip <= 1e-4)
        {
            // No room to spread it over - a shot fired from inside its own reach distance.
            this.applyTargetScale();
            return;
        }

        const covered = 1 - (remaining - margin) / trip;
        this._growProgress = Math.min(1, Math.max(this._growProgress, covered));

        if (this._growProgress >= 1)
        {
            this.applyTargetScale();
            return;
        }

        const t = easing.sineIn(this._growProgress);
        Vec3.lerp(this._characterScale, this._characterBaseScale, this._characterTargetScale, t);
        this.characterRoot.setScale(this._characterScale);
    }

    /**
     * Reaches the bee into the grip it lands in, over the last stretch of the run-in.
     *
     * The bee flies at the spot the prefab parks it - above the cube - and grips from the standoff on
     * the pull axis, and for any pull that is not straight up those are different sides of the cube.
     * Set on the landing frame, as it used to be, that is the bee jumping around its own cube in
     * exactly the moment it is biggest on screen and about to hold still, which is the snap this
     * blend exists to remove. The landing turn was already eased; this is the other half of the same
     * pose, the half that was not.
     *
     * It can start before the pull direction is known because both ends are constants in the bullet's
     * own space, and the bullet is squared up to the pull by then anyway: the run-in flies straight
     * down the corridor, which is the axis the cube comes out along, so the frame the offset is
     * expressed in has already converged on the one the landing will square it to. The last of it is
     * still put on exactly by landOnFace - by then this has made that a no-op rather than a jump.
     *
     * Paced off distance to the cube, not time, so it is finished when the bee gets there however
     * fast it flew - and eased at both ends, so it neither starts nor stops abruptly.
     */
    private reachForGrip(remaining: number): void
    {
        if (this.gripReachDistance <= 0) return;
        if (remaining >= this.gripReachDistance) return;

        const reached = Math.min(1, Math.max(0, 1 - remaining / this.gripReachDistance));
        const t = easing.cubicInOut(reached);

        this.standoffAlong(this._gripPos, this._localOutAxis);
        Vec3.lerp(this._characterPos, this._characterBasePos, this._gripPos, t);
        this.characterRoot.setPosition(this._characterPos);

        Quat.slerp(this._gripScratch, this._characterBaseRot, this._gripRotation, t);
        this.characterRoot.setRotation(this._gripScratch);
    }

    /** Ends the resize on the size it was aiming for, exactly. */
    private applyTargetScale(): void
    {
        this._characterResizing = false;
        if (this.characterRoot) this.characterRoot.setScale(this._characterTargetScale);
    }

    /**
     * Slides the bee back to the spot the prefab gave it above the cube, now that it is done
     * gripping a face - measured against the map's cube size rather than the one the prefab was
     * authored with, so it sits on the cube it is actually holding.
     */
    private settleCharacter(dt: number): void
    {
        if (!this.characterRoot) return;

        this.standoffAlong(this._characterRestPos, this._characterBaseDir);

        const t = 1 - Math.exp(-Math.max(0, this.characterSettleSpeed) * dt);
        Vec3.lerp(this._characterPos, this.characterRoot.position, this._characterRestPos, t);
        this.characterRoot.setPosition(this._characterPos);
    }

    /**
     * Where the bee sits when it is holding the cube from direction `axis`: clear of the cube's
     * surface by the gap the prefab was authored with. Measured against the cube's CURRENT size,
     * since the stand-in is resized to whatever the map draws its cubes at and the authored offset
     * would leave the bee floating off a smaller one.
     *
     * The authored gap is scaled with the rig, since the bee is too - it is part of the arrangement,
     * not a fixed clearance, and left alone it would read as a bigger bee sitting tighter on its
     * cube. extraCharacterGap is not scaled: that one is a hand nudge, and a nudge that changed size
     * with the level would be no use to tune with.
     */
    private standoffAlong(out: Vec3, axis: Readonly<Vec3>): Vec3
    {
        return Vec3.multiplyScalar(out, axis, this.getStandoffDistance());
    }

    /**
     * How far (world units) out from a cube's centre the bee comes to rest when gripping one of its
     * faces. Public because the leg that flies the bee in has to END here: aim that leg at the
     * cube's own cell instead and the bee flies INTO the cube, and the standoff yanks it back out on
     * the landing frame - a jump at the exact moment it is biggest on screen.
     *
     * Valid from beginApproach() onwards when the caller passed a cube size, which is what the
     * measurement is taken against; before that it describes the prefab's authored cube.
     */
    public getStandoffDistance(): number
    {
        const halfSize = this._cubeSizeY * 0.5;
        const gap = this._characterSurfaceGap * this._cubeScaleRatio + this.extraCharacterGap;
        return halfSize + gap;
    }

    /**
     * How far, and which way, the bullet moved along its PATH this frame.
     *
     * Measured with the weave discounted, because what reads it back is the weave's own sideways
     * axis: a weave that took its axis from its own output would steer itself off course. The
     * facing wants the opposite - see measureRenderMovement().
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
     * How far, and which way, the bullet moved this frame as it will actually be drawn - the weave
     * included, since it has been applied by the time this runs. This is the movement vector the
     * bee is pointed down, so that what it faces is where it is really going.
     */
    private measureRenderMovement(): void
    {
        this.node.getWorldPosition(this._worldPosNow);

        if (this._hasPrevRenderPos)
        {
            Vec3.subtract(this._renderMove, this._worldPosNow, this._prevRenderPos);
        }
        else
        {
            this._renderMove.set(0, 0, 0);
            this._hasPrevRenderPos = true;
        }

        this._prevRenderPos.set(this._worldPosNow);
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
     * Squares the bullet up to the face the cube will be pulled out of, given the direction it comes
     * out in. Uses the same Quat.fromViewUp() as the travel facing does, which is what lets the grip
     * pose be expressed against one fixed local axis (see cacheGripPose).
     *
     * Aimed AGAINST the pull, which is to say down the heading the approach flew in on. Facing the
     * pull instead is the same pose turned 180 degrees, and since the approach leg is the reversed
     * corridor - it flies in along exactly the direction the cube will come out along, backwards -
     * that is a half-turn snapped on in the single frame the bee touches down, in the middle of the
     * screen, with the flight held still. The turn-around a flight does need is real but it belongs
     * on the way out, where faceAlongTravel eases it at carryTurnSpeed while the bee is already
     * moving; here it costs nothing to leave the heading alone, because which way round the node
     * sits is not what puts the bee on the cube - the local pull axis is.
     */
    public faceForPull(outwardDir: Readonly<Vec3>): void
    {
        if (!outwardDir || outwardDir.lengthSqr() < 1e-8) return;

        this._travelDir.set(-outwardDir.x, -outwardDir.y, -outwardDir.z);
        this._travelDir.normalize();

        // Cubes come out upwards as readily as sideways, and a straight-up view against the default
        // up has no basis - Quat.fromViewUp() gives back the identity there, which would leave the
        // bee gripping thin air off some unrelated face. Any up not parallel to the pull will do:
        // it only fixes the roll about an axis the bee is symmetrical enough about, and the pull
        // axis itself - which is what the grip pose is built on - comes out the same either way.
        const upright = Math.abs(Vec3.dot(this._travelDir, Vec3.UP)) > 0.9995;
        Quat.fromViewUp(this._facing, this._travelDir, upright ? Vec3.FORWARD : Vec3.UP);
        this.node.setWorldRotation(this._facing);
    }
}
