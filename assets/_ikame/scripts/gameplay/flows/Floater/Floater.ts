import { _decorator, Component, easing, Node, tween, Tween, Vec3 } from 'cc';
import { IShooterItem } from '../ShooterItem/IShooterItem';
import { lerp3, lerp3Vec3 } from '../../../utils/Utils';
const { ccclass, property } = _decorator;
        
const upPosition = new Vec3(0, 0.1, 0);
const OUT_SCALE = new Vec3(.76, .76, .76);

@ccclass('Floater')
export class Floater extends Component {

    private _shooter: IShooterItem = null;

    private _initPosition = new Vec3();
    private _downPosition = new Vec3();
    private _pos = new Vec3();
    private tweenObj  = {value : 0};
    

    protected start(): void
    {
        this.setShooter(null);
        this._initPosition.set(this.node.getPosition());
        this._downPosition.set(this._initPosition);
        this._downPosition.y = -0.6;
    }
    
    public setShooter(shooter: IShooterItem): void
    {
        this._shooter = shooter;
    }

    public getShooter(): IShooterItem
    {
        return this._shooter;
    }

    public isTaken (): boolean
    {
        return this._shooter !== null && this._shooter !== undefined;
    }

    public floatDownAsync(duration: number): Promise<void> 
    {
        return new Promise((resolve) => {
            Tween.stopAllByTarget(this.tweenObj);
            this.tweenObj.value = 0;
            tween(this.tweenObj)
                .to(duration, { value: 1 }, {
                    easing: easing.quadOut, onUpdate: () => {
                        lerp3Vec3(this._initPosition, this._downPosition, this._initPosition, this.tweenObj.value, this._pos);
                        this.node.setPosition(this._pos);
                    },
                    onComplete: () => {
                        resolve();
                    }
                }).start();
        });
    }
}


