import { _decorator, Component } from 'cc';
import { ICacheSlot } from './ICacheSlot';
import { ICacheSlotController } from './ICacheSlotController';
import { IShooterItem } from '../flows/ShooterItem/IShooterItem';
const { ccclass } = _decorator;

@ccclass('CacheSlot')
export class CacheSlot extends Component implements ICacheSlot 
{
    private _slotController: ICacheSlotController;
    private _rightSlot : ICacheSlot | null = null;
    private _leftSlot: ICacheSlot | null = null;
    
    private _shooterItem: IShooterItem | null = null;
    
    init (slotController : ICacheSlotController, rightSlot: ICacheSlot, leftSlot: ICacheSlot) : void
    {
        this._slotController = slotController;
        this._rightSlot = rightSlot;
        this._leftSlot = leftSlot;
    }
    
    getLeftSlot(): ICacheSlot | null
    {
        return this._leftSlot;
    }

    getRightSlot(): ICacheSlot | null
    {
        return this._rightSlot;
    }

    setShooter(shooter: IShooterItem): void
    {
        this._shooterItem = shooter;
    }

    getShooter(): IShooterItem | null
    {
        return this._shooterItem;
    }

    removeShooter(): IShooterItem | null
    {
        const shooter = this._shooterItem;
        this._shooterItem = null;
        return shooter;
    }
}


