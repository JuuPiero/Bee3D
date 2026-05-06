import { _decorator, CCBoolean, CCFloat, Vec3} from 'cc';
import { SplineSmooth } from '../../../splines/SplineSmooth';
import { Floater } from '../Floater/Floater';
import { EventDispatcher } from '../../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../../designPatterns/observer/EventName';

const { ccclass, property } = _decorator;

const SLOT_SIZE = 1.36;

@ccclass('Conveyor')
export class Conveyor extends SplineSmooth 
{
    @property([ Floater ]) floaters: Floater[] = [];

    private _inConveyCount: number = 0;

    @property(CCFloat) speed: number = 5.6;
    @property(CCFloat) speedFast = 9.2;

    @property(CCBoolean)
    public set alignSlots(value: boolean)
    {
        const floaters = this.node.getComponentsInChildren(Floater);
        const offset = SLOT_SIZE * floaters.length / 2;
        const pos = new Vec3();
        for (let i = 0; i < floaters.length; i++)
        {
            const floater = floaters[i];
            pos.x = i * SLOT_SIZE - offset + SLOT_SIZE / 2;
            floater.node.setPosition(pos);
        }
    }

    public get alignSlots(): boolean
    {
        return false;
    }

    protected start(): void
    {
        super.start();
        EventDispatcher.addListener(EventName.ShooterInConvey, this.onShooterInConvey, this);
        this.floaters = this.node.getComponentsInChildren(Floater);
    }

    protected onDestroy(): void
    {
        EventDispatcher.removeListener(EventName.ShooterInConvey, this.onShooterInConvey, this);
    }

    public onShooterInConvey(inConvey: boolean): void
    {
        this._inConveyCount += inConvey ? 1 : -1;
        this._inConveyCount = Math.max(0, this._inConveyCount);
    }

    public init(): void 
    {

    }

    public getNextEmpty(): Floater | null 
    {
        for (let i = 0; i < this.floaters.length; i++)
        {
            const floater = this.floaters[i];
            if (floater.isTaken()) continue;
            return floater;
        }
        return null;
    }

    public isFullSlot(): boolean
    {
        for (let i = 0; i < this.floaters.length; i++)
        {
            const floater = this.floaters[i];
            if (!floater.isTaken())
            {
                return false;
            }
        }
        return true;
    }

}


