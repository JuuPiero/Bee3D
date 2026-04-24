import { _decorator, Component, easing, Node, tween, Tween, Vec3 } from 'cc';
import { SplineFollowerSpeed } from '../../../splines/SplineFollowerSpeed';
import { IShooterItem } from '../ShooterItem/IShooterItem';
const { ccclass, property } = _decorator;
        
const upPosition = new Vec3(0, 0.1, 0);
const OUT_SCALE = new Vec3(.76, .76, .76);

@ccclass('Floater')
export class Floater extends SplineFollowerSpeed {

    private _shooter: IShooterItem = null;

    protected start(): void
    {
        this.setShooter(null);
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

    public popupAnim(): void 
    {
        const root = this.node.children[ 0 ];
        Tween.stopAllByTarget(root);
        root.setScale(Vec3.ZERO);
        root.setPosition(Vec3.ZERO);

        const t1 = tween(root)
            .to(0.5, { scale: OUT_SCALE }, { easing: easing.backOut })
        const t2 = tween(root)
            .to(0.3, { position: upPosition }, { easing: easing.quadOut })
            .to(0.2, { position: Vec3.ZERO }, { easing: easing.quadIn });

        tween(root)
            .delay(0.1)
            .parallel(t1, t2)
            .start();
    }

    public shrinkAnim(): void 
    {
        const root = this.node.children[ 0 ];
        Tween.stopAllByTarget(root);
        root.setScale(Vec3.ZERO);
    }
}


