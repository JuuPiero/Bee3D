import { _decorator, CCFloat, Component, Quat, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

const MIN_SQR_DISTANCE = 1e-6;

@ccclass('RotateToForwardVelocity')
export class RotateToForwardVelocity extends Component {

    @property(CCFloat)
    public rotateSpeed: number = 0; // degrees/sec, 0 = snap instantly

    private _prePosition: Vec3 = new Vec3();
    private _newPosition: Vec3 = new Vec3();
    private _direction: Vec3 = new Vec3();
    private _targetRotation: Quat = new Quat();

    start() {
        this.node.getWorldPosition(this._prePosition);
    }

    update(deltaTime: number) {
        this.node.getWorldPosition(this._newPosition);
        Vec3.subtract(this._direction, this._newPosition, this._prePosition);

        if (this._direction.lengthSqr() > MIN_SQR_DISTANCE) {
            this._direction.normalize();
            Quat.fromViewUp(this._targetRotation, this._direction);

            if (this.rotateSpeed > 0) {
                const t = Math.min(1, (this.rotateSpeed * Math.PI / 180) * deltaTime);
                Quat.slerp(this._targetRotation, this.node.worldRotation, this._targetRotation, t);
            }

            this.node.setWorldRotation(this._targetRotation);
        }

        this._prePosition.set(this._newPosition);
    }
}
