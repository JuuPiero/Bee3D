import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('FixUpAxis')
export class FixUpAxis extends Component {

    @property(Vec3)
    public upAxis: Vec3 = new Vec3(0, 0.866, 0.5);

    private _forward: Vec3 = new Vec3();
    private _rotation: Quat = new Quat();

    lateUpdate() {
        this.node.getWorldRotation(this._rotation);
        Vec3.transformQuat(this._forward, Vec3.FORWARD, this._rotation);

        Quat.fromViewUp(this._rotation, this._forward, this.upAxis);
        this.node.setWorldRotation(this._rotation);
    }
}
