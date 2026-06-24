import { _decorator, Component, Material, Node } from 'cc';
import { TweenBurst } from './TweenBurst';
const { ccclass, property } = _decorator;

/**
 * Particle-system-style emitter for TweenBurst nodes.
 * Configure all particle properties here — they are pushed onto every
 * child TweenBurst before firing, so you never need to touch the children.
 */
@ccclass('TweenBurstGroup')
export class TweenBurstGroup extends Component {

    @property({ type: [TweenBurst] })
    targets: TweenBurst[] = [];

    // ── Direction / cone ───────────────────────────────────────────────────

    /** Center axis of the cone (0 = right, 90 = up, 180 = left, 270 = down) */
    @property coneDirection: number = 90;

    /** Total angular width of the cone (e.g. 60 → ±30° around coneDirection) */
    @property coneAngle: number = 60;

    /**
     * true  → evenly spaced angles across the cone.
     * false → each particle gets a random angle within the cone.
     */
    @property evenSpread: boolean = false;

    // ── Lifetime ───────────────────────────────────────────────────────────

    @property duration: number = 0.8;
    @property durationVariance: number = 0.2;

    // ── Speed ──────────────────────────────────────────────────────────────

    @property burstForce: number = 400;
    @property burstForceVariance: number = 120;
    /** No particle launches slower than this, preventing straight drops */
    @property minBurstForce: number = 150;

    // ── Physics ────────────────────────────────────────────────────────────

    @property gravity: number = 800;

    // ── Spin ───────────────────────────────────────────────────────────────

    @property spinSpeed: number = 720;
    @property spinSpeedVariance: number = 360;
    @property randomSpinDirection: boolean = true;

    // ── Depth spread ───────────────────────────────────────────────────────

    /** Max X velocity added to each particle on top of the cone direction */
    @property xSpread: number = 200;

    /** Max Z velocity (depth) added to each particle to spread them in 3D */
    @property zSpread: number = 200;

    // ── Spawn scatter ──────────────────────────────────────────────────────

    /** Radius (px) of the circle each particle is scattered within at spawn */
    @property spawnRadius: number = 20;

    // ── Playback ───────────────────────────────────────────────────────────

    /** Multiplier on animation speed — >1 faster, <1 slower */
    @property speedScale: number = 1;

    // ── Visuals ────────────────────────────────────────────────────────────

    @property scalePunch: boolean = true;
    @property fadeOut: boolean = true;
    @property scaleDown: boolean = false;
    @property scaleDownStart: number = 0.65;

    // ── Timing ─────────────────────────────────────────────────────────────

    /** Delay in seconds between each successive burst (0 = all fire simultaneously) */
    @property staggerDelay: number = 0.05;

    @property autoPlay: boolean = true;

    // ───────────────────────────────────────────────────────────────────────

    protected onEnable(): void {
        if (this.autoPlay) this.play();
    }

    play(): void {
        const count = this.targets.length;
        if (count === 0) return;

        // Pre-distribute all per-particle values across the full variance range
        // so no two particles are too similar (stratified sampling + shuffle).
        const forces    = this._distribute(this.burstForce,  this.burstForceVariance,  count)
                            .map(f => Math.max(this.minBurstForce, f));
        const durations = this._distribute(this.duration,    this.durationVariance,    count);
        const spins     = this._distribute(this.spinSpeed,   this.spinSpeedVariance,   count);
        const xVels     = this._distribute(0,               this.xSpread,             count);
        const zVels     = this._distribute(0,               this.zSpread,             count);

        this.targets.forEach((target, i) => {
            if (!target || !target.isValid) return;

            const angle    = this._coneAngleFor(i, count);
            const force    = forces[i];
            const duration = durations[i];
            const spinDir  = (this.randomSpinDirection && Math.random() < 0.5) ? -1 : 1;
            const spin     = spins[i] * spinDir;

            const fire = () => {
                target.node.active = true;
                if (this.spawnRadius > 0) {
                    const r = Math.random() * this.spawnRadius;
                    const a = Math.random() * Math.PI * 2;
                    target.node.setPosition(Math.cos(a) * r, Math.sin(a) * r, 0);
                }
                // Set exact pre-computed values; zero out variance so TweenBurst
                // doesn't add another layer of randomness on top.
                target.duration          = duration;
                target.durationVariance  = 0;
                target.burstForce        = force;
                target.burstForceVariance = 0;
                target.spinSpeed         = spin;
                target.spinSpeedVariance = 0;
                target.randomSpinDirection = false;
                target.gravity           = this.gravity;
                target.speedScale        = this.speedScale;
                target.scalePunch        = this.scalePunch;
                target.fadeOut           = this.fadeOut;
                target.scaleDown        = this.scaleDown;
                target.scaleDownStart   = this.scaleDownStart;
                target.randomAngle       = false;
                target.play(angle, zVels[i], xVels[i]);
            };

            if (this.staggerDelay > 0 && i > 0) {
                this.scheduleOnce(fire, this.staggerDelay * i);
            } else {
                fire();
            }
        });
    }

    /**
     * Stratified sampling: divides [base-variance, base+variance] into `count`
     * equal slots, picks one random value per slot, then shuffles the result.
     * Guarantees the full range is covered — no two particles too similar.
     */
    private _distribute(base: number, variance: number, count: number): number[] {
        if (variance === 0 || count <= 1) {
            return Array.from({ length: count }, () => base + (Math.random() * 2 - 1) * variance);
        }
        const min = base - variance;
        const slotSize = (variance * 2) / count;
        const values = Array.from({ length: count }, (_, i) =>
            min + i * slotSize + Math.random() * slotSize
        );
        // Fisher-Yates shuffle so index order doesn't determine the value
        for (let i = values.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = values[i]; values[i] = values[j]; values[j] = tmp;
        }
        return values;
    }

    private _coneAngleFor(index: number, total: number): number {
        const halfSpread = this.coneAngle / 2;
        if (this.evenSpread) {
            const t = total > 1 ? index / (total - 1) : 0.5;
            return this.coneDirection - halfSpread + t * this.coneAngle;
        }
        return this.coneDirection + (Math.random() * 2 - 1) * halfSpread;
    }

    public setMaterial(mat: Material): void 
    {
        for (let target of this.targets)
        {
            target.setMaterial(mat);
        }
    }
}
