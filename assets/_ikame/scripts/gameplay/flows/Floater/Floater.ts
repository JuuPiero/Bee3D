import { _decorator, Component, Node } from 'cc';
import { SplineFollowerSpeed } from '../../../splines/SplineFollowerSpeed';
import { IShooterItem } from '../ShooterItem/IShooterItem';
const { ccclass, property } = _decorator;

@ccclass('Floater')
export class Floater extends SplineFollowerSpeed {

    private _shooter: IShooterItem = null;
    
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
        return this._shooter != null;
    }
}


