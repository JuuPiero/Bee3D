import { _decorator, CCBoolean, CCFloat, Component, Quat, Vec3 } from 'cc';
import { SplineSmooth } from './SplineSmooth';
import { EDITOR } from 'cc/env';
const { ccclass, property } = _decorator;

@ccclass('SplineFollower')
export class SplineFollower extends Component {

    @property(SplineSmooth)
    spline: SplineSmooth | null = null;

    @property({type:CCFloat, range:[0,1,0.01]})
    progress: number = 0;

    @property(CCBoolean) protected updateRotation: boolean = true;

    protected _position: Vec3 = new Vec3();
    protected _rotation: Quat = new Quat();

    protected update(dt: number): void
    {
        if (EDITOR)
        {
            if (this.spline)
            {
                this.spline.getPercentageTransform(this.progress, this._position, this._rotation);
                this.node.setPosition(this._position);
                if (this.updateRotation) {
                    this.node.setRotation(this._rotation);
                }
            }
        }
    }

    public setPrgogress(progress: number): void
    {
        this.progress = progress;
        this.spline.getPercentageTransform(this.progress, this._position, this._rotation);
        this.node.setPosition(this._position);
        if (this.updateRotation) {
            this.node.setRotation(this._rotation);
        }
    }
}


