import { _decorator, Camera, CCBoolean, Component, EventTouch, Input, input, math, Node, Quat, Vec2, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DragRotateController')
export class DragRotateController extends Component {
    @property
    threshold: number = 0.1;

    @property({ tooltip: 'Degrees of rotation per pixel of drag' })
    sensitivity: number = 0.2;

    @property
    stopAcceleration: number = 0.1;

    @property
    maxVelocity: number = 30.0;

    @property({ tooltip: 'How quickly velocity tracks current drag (0=no inertia, 1=instant). Lower = smoother but weaker inertia.' })
    velocitySmoothing: number = 0.25;

    @property
    autoRotateInterval: number = 3.0;

    @property
    autoRotateSpeed: number = 20.0;

    @property
    allowHorizontalRotation: boolean = true;

    @property
    allowVerticalRotation: boolean = false;

    @property({ type: Camera })
    camera: Camera = null;

    // ── statics (mirror Unity's public statics) ──────────────────────────
    public static IsLocked: boolean = false;
    public static OnRotationInput: (() => void) | null = null;

    @property(CCBoolean)
    public allowAutoRotate: boolean = false;

    // ── private state ────────────────────────────────────────────────────
    private _currentVelocity: Vec2 = new Vec2();
    private _idleTime: number = 0;
    private _touchActive: boolean = false;  // true while finger is down
    private _hasDragged: boolean = false;   // true if finger moved significantly this touch
    private _lastAutoRotateDirection: number = 1;
    private _lastMoveTime: number = 0;

    start() 
    {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    // ── lifecycle ────────────────────────────────────────────────────────
    update(deltaTime: number) {
        if (this._touchActive) {
            this._idleTime = 0;
        } else {
            this.handleRotate();
            if (this.allowAutoRotate) {
                this.handleAutoRotate(deltaTime);
            }
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private get cameraUp(): Vec3 {
        return this.camera ? this.camera.node.up.clone() : Vec3.UP.clone();
    }

    private get cameraRight(): Vec3 {
        return this.camera ? this.camera.node.right.clone() : Vec3.RIGHT.clone();
    }

    /** Apply a rotation delta (in degrees) to the node using camera-relative axes.
     *  Z-axis is reversed in Cocos vs Unity, so we negate x (horizontal) to stay
     *  consistent with Unity's  AngleAxis(-final.x, up)  convention, and negate y
     *  (vertical) to compensate for the reversed right-vector pitch direction.
     */
    private applyRotation(finalDeg: Vec2): void {
        const toRad = Math.PI / 180;
        if (this.allowHorizontalRotation) {
            // Cocos right-hand Y-up: positive angle around up = counter-clockwise from above.
            // Drag right (x+) → rotate right → positive angle.
            const q = new Quat();
            Quat.fromAxisAngle(q, this.cameraUp, finalDeg.x * toRad);
            this.node.rotate(q, Node.NodeSpace.WORLD);
        }
        if (this.allowVerticalRotation) {
            // Unity: AngleAxis(+y, cameraRight) — negate here because Cocos Z is reversed
            const q = new Quat();
            Quat.fromAxisAngle(q, this.cameraRight, -finalDeg.y * toRad);
            this.node.rotate(q, Node.NodeSpace.WORLD);
        }
    }

    // ── rotation (inertia / decay) ───────────────────────────────────────
    handleRotate(): void {
        if (DragRotateController.IsLocked) {
            this._currentVelocity.set(0, 0);
            return;
        }

        if (this._currentVelocity.length() < 0.01) return;

        // Decay velocity (mirrors Unity's Lerp(mag, 0, stopAcceleration))
        const mag = this._currentVelocity.length();
        const dir = this._currentVelocity.clone().normalize();
        const newMag = math.lerp(mag, 0, this.stopAcceleration);
        this._currentVelocity = dir.multiplyScalar(newMag);

        let final = this._currentVelocity.clone().multiplyScalar(this.sensitivity);

        // Clamp velocity
        if (final.length() > this.maxVelocity) {
            final = final.normalize().multiplyScalar(this.maxVelocity);
        }

        this.applyRotation(final);
    }

    // ── touch callbacks (attach via node.on / input.on externally) ───────
    onTouchStart(event: EventTouch): void {
        this._touchActive = true;
        this._hasDragged = false;
        this._currentVelocity.set(0, 0);
        this._idleTime = 0;
        this._lastMoveTime = performance.now();
    }

    onTouchMove(event: EventTouch): void {
        const delta = event.getDelta();
        const deltaVec = new Vec2(delta.x, delta.y);
        if (deltaVec.length() < this.threshold) {
            // Finger is held still — bleed off accumulated velocity so it doesn't
            // burst out when the user lifts their finger.
            this._currentVelocity.set(0, 0);
            return;
        }

        if (DragRotateController.IsLocked) return;

        DragRotateController.OnRotationInput?.();
        this._hasDragged = true;

        // Smooth velocity toward current delta instead of accumulating — prevents
        // light drags from building up disproportionately large inertia.
        Vec2.lerp(this._currentVelocity, this._currentVelocity, deltaVec, this.velocitySmoothing);
        // Hard-cap so even rapid short drags can't exceed maxVelocity from the start
        const velMag = this._currentVelocity.length();
        if (velMag > this.maxVelocity) {
            this._currentVelocity.multiplyScalar(this.maxVelocity / velMag);
        }
        this._idleTime = 0;
        this._lastMoveTime = performance.now();

        // Track last intentional horizontal direction for auto-rotate
        if (Math.abs(delta.x) > 0.01) {
            this._lastAutoRotateDirection = Math.sign(delta.x);
        }

        // Apply immediate rotation from input (mirrors Unity's OnDrag direct apply)
        const immediate = new Vec2(delta.x, delta.y).multiplyScalar(this.sensitivity);
        this.applyRotation(immediate);
    }

    onTouchEnd(event: EventTouch): void {
        this._touchActive = false;
        // If the finger was held still before release (no movement for > 100ms),
        // clear velocity so the node does not continue spinning.
        if (performance.now() - this._lastMoveTime > 100) {
            this._currentVelocity.set(0, 0);
            this._hasDragged = false;
        }
    }

    // ── auto-rotate ──────────────────────────────────────────────────────
    handleAutoRotate(deltaTime: number): void {
        if (DragRotateController.IsLocked) return;

        if (this._idleTime < this.autoRotateInterval) {
            this._idleTime += deltaTime;
            return;
        }

        // Constant auto-rotation in the direction of the last user swipe
        const angleDeg = this.autoRotateSpeed * this._lastAutoRotateDirection * deltaTime;
        const q = new Quat();
        Quat.fromAxisAngle(q, this.cameraUp, angleDeg * Math.PI / 180);
        this.node.rotate(q, Node.NodeSpace.WORLD);
    }

    // ── public API ───────────────────────────────────────────────────────
    /** Returns true if the user moved their finger significantly during this touch.
     *  Use this to distinguish a tap (false) from a drag rotation (true). */
    public isDragging(): boolean {
        return this._hasDragged;
    }
}


