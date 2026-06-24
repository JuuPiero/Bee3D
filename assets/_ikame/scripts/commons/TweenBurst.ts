import { _decorator, Component, Tween, tween, UIOpacity, Vec3, math, MeshRenderer, Material } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Animates a block bursting out of an explosion:
 *   - Scale punch (0 → overshoot → 1)
 *   - Physics arc (initial velocity + gravity)
 *   - Spin rotation
 *   - Optional fade-out at the end
 *
 * Call play() to trigger, or enable autoPlay to fire on enable.
 */
@ccclass('TweenBurst')
export class TweenBurst extends Component {

    @property duration: number = 0.8;
    /** ± random added to duration each play */
    @property durationVariance: number = 0.2;

    /** Initial launch speed in px/s */
    @property burstForce: number = 400;
    /** ± random added to burstForce each play */
    @property burstForceVariance: number = 120;

    /** Launch angle in degrees (0 = right, 90 = up). Ignored when randomAngle is true. */
    @property burstAngle: number = 90;

    /** Pick a completely random launch direction each play */
    @property randomAngle: boolean = true;

    /** Downward acceleration in px/s² */
    @property gravity: number = 800;

    /** Rotation speed in degrees/s during flight */
    @property spinSpeed: number = 720;
    /** ± random added to spinSpeed each play */
    @property spinSpeedVariance: number = 360;
    /** Randomly flip spin direction (CW vs CCW) each play */
    @property randomSpinDirection: boolean = true;

    /** Scale from 0 → overshoot → 1 at the start */
    @property scalePunch: boolean = true;

    /** Fade opacity to 0 in the last 40% of the animation */
    @property fadeOut: boolean = true;

    /** Scale the node to zero in the last portion of the animation (landing shrink) */
    @property scaleDown: boolean = false;

    /** Progress (0–1) at which the landing scale-down begins */
    @property scaleDownStart: number = 0.65;

    /** Multiplier on animation speed — >1 faster, <1 slower */
    @property speedScale: number = 1;

    /** Deactivate the node when the animation finishes */
    @property deactivateOnComplete: boolean = true;

    /** Trigger play() automatically when the component is enabled */
    @property autoPlay: boolean = false;

    private static FRAME_SIGN: boolean = false;
    private _frameSign: boolean = false;
    private _frameCount: number = -1;

    private _playing: boolean = false;
    private _punchDone: boolean = true;
    private _t: number = 0;
    private _duration: number = 0;
    private _spinSpeed: number = 0;
    private _startPos: Vec3 = new Vec3();
    private _startAngle: number = 0;
    private _vx: number = 0;
    private _vy0: number = 0;
    private _vz: number = 0;
    private _uiOpacity: UIOpacity | null = null;

    protected onLoad(): void {
        TweenBurst.FRAME_SIGN = !TweenBurst.FRAME_SIGN;
        this._frameSign = TweenBurst.FRAME_SIGN;
    }

    protected start(): void {
        // Keep update() off until play() is called.
        if (!this.autoPlay) this.enabled = false;
    }

    protected onEnable(): void {
        if (this.autoPlay) this.play();
    }

    protected onDisable(): void {
        // Only kill tweens when externally interrupted; self-disable at end of play leaves tweens intact.
        if (this._playing) {
            this._playing = false;
            Tween.stopAllByTarget(this.node);
        }
    }

    /** @param angleDegOverride when set, skips randomAngle/burstAngle and uses this value directly */
    /** @param vzOverride z-axis velocity (depth) set externally by the group */
    play(angleDegOverride?: number, vzOverride: number = 0, vxExtra: number = 0): void {
        this.enabled = true;              // re-enable update loop before anything else
        Tween.stopAllByTarget(this.node); // cancel any lingering shrink/punch tween
        const angleDeg = angleDegOverride !== undefined
            ? angleDegOverride
            : (this.randomAngle ? Math.random() * 360 : this.burstAngle);
        const rad = math.toRadian(angleDeg);

        // Randomize per-play values
        this._duration = Math.max(0.1, this.duration + (Math.random() * 2 - 1) * this.durationVariance);
        const force = Math.max(0, this.burstForce + (Math.random() * 2 - 1) * this.burstForceVariance);
        const spinDir = (this.randomSpinDirection && Math.random() < 0.5) ? -1 : 1;
        this._spinSpeed = (this.spinSpeed + (Math.random() * 2 - 1) * this.spinSpeedVariance) * spinDir;

        this._startPos.set(this.node.position);
        this._startAngle = this.node.angle;
        this._vx = Math.cos(rad) * force + vxExtra;
        this._vy0 = Math.sin(rad) * force;
        this._vz = vzOverride;
        this._t = 0;
        this._playing = true;

        // Scale punch: pop from zero, overshoot, settle at 1
        if (this.scalePunch) {
            this._punchDone = false;
            this.node.setScale(Vec3.ZERO);
            tween(this.node)
                .to(0.12, { scale: new Vec3(1.3, 1.3, 1.3) }, { easing: 'backOut' })
                .to(0.08, { scale: Vec3.ONE }, { easing: 'quadIn' })
                .call(() => { this._punchDone = true; })
                .start();
        } else {
            this._punchDone = true;
        }

        this._uiOpacity = this.node.getComponent(UIOpacity);
        if (this._uiOpacity) this._uiOpacity.opacity = 255;
    }

    protected lateUpdate(dt: number): void {
        if (!this._playing) return;

        this._frameCount = (this._frameCount + 1) % 2;
        const isEventFrame = (this._frameCount === 0) === this._frameSign;

        this._t += dt * this.speedScale;
        const progress = Math.min(this._t / this._duration, 1);

        if (isEventFrame)
        {
            this.node.setPosition(
                this._startPos.x + this._vx  * this._t,
                this._startPos.y + this._vy0 * this._t - 0.5 * this.gravity * this._t * this._t,
                this._startPos.z + this._vz  * this._t,
            );

            // Steady spin
            this.node.angle = this._startAngle + this._spinSpeed * this._t;

            // Fade out during the last 40% of the animation
            if (this.fadeOut && this._uiOpacity) {
                const fadeStart = 0.6;
                if (progress > fadeStart) {
                    const fadeRatio = (progress - fadeStart) / (1 - fadeStart);
                    this._uiOpacity.opacity = Math.round(255 * (1 - fadeRatio));
                }
            }

            // Scale down to zero as the block approaches landing
            if (this.scaleDown && this._punchDone && progress > this.scaleDownStart) {
                const t = (progress - this.scaleDownStart) / (1 - this.scaleDownStart);
                const s = 1 - t;
                this.node.setScale(s, s, s);
            }
        }

        if (progress >= 1) {
            this._playing = false;
            // Disable before deactivate so onDisable doesn't kill a running shrink tween.
            this.enabled = false;
            if (this.deactivateOnComplete) {
                if (this.scaleDown) {
                    this.node.active = false;
                } else {
                    Tween.stopAllByTarget(this.node);
                    tween(this.node)
                        .to(0.12, { scale: new Vec3(0, 0, 0) }, { easing: 'quadIn' })
                        .call(() => { this.node.active = false; })
                        .start();
                }
            }
        }
    }

    @property([MeshRenderer]) private meshRenders: MeshRenderer[] = []
    

    public setMaterial(mat: Material)
    {
        for (let render of this.meshRenders)
        {
            render.setSharedMaterial(mat, 0);
        }
    }
}
