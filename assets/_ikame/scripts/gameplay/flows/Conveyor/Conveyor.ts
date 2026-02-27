import { _decorator, Camera, CCFloat, Node, UITransform } from 'cc';
import { SplineSmooth } from '../../../splines/SplineSmooth';
import { SplineFollowerSpeed } from '../../../splines/SplineFollowerSpeed';
import { Floater } from '../Floater/Floater';
import { EventDispatcher } from '../../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../../designPatterns/observer/EventName';
import { CapacityBar } from '../../../uis/CapacityBar';

const { ccclass, property } = _decorator;

const CONVEY_SIZE = 6.6;

@ccclass('Conveyor')
export class Conveyor extends SplineSmooth 
{
    @property([ Floater ]) floaters: Floater[] = [];
    @property(CapacityBar) capacityBar: CapacityBar = null;

    private _inConveyCount: number = 0;


    protected start(): void
    {
        super.start();
        EventDispatcher.addListener(EventName.ShooterInConvey, this.onShooterInConvey, this);
        this.floaters = this.node.getComponentsInChildren(Floater);
        this.capacityBar.setProgress(0, this.floaters.length);
        EventDispatcher.addListener(EventName.SureWinFinalStep, this.speedUp, this);
    }

    private speedUp(): void
    {
        for (let i = 0; i < this.floaters.length; i++)
        {
            const floater = this.floaters[i];
            floater.setSpeed(9.2);
        }
    }

    protected onDestroy(): void
    {
        EventDispatcher.removeListener(EventName.SureWinFinalStep, this.speedUp, this);
        EventDispatcher.removeListener(EventName.ShooterInConvey, this.onShooterInConvey, this);
    }

    public onShooterInConvey(inConvey: boolean): void
    {
        this._inConveyCount += inConvey ? 1 : -1;
        this._inConveyCount = Math.max(0, this._inConveyCount);
        this.capacityBar.setProgress(this._inConveyCount , this.floaters.length);
    }

    public init(speed: number = 5.6): void 
    {
        console.log(`Conveyor: Loaded with ${this.floaters.length} floaters.`);
        for (let i = 0; i < this.floaters.length; i++)
        {
            const floater = this.floaters[i];
            floater.spline = this;
            floater.setSpeed(speed);
            floater.setLooping(true);

            floater.setProgress(i / this.floaters.length);

        }
    }

    public getNextEmpty(): Floater | null 
    {
        // We want the empty slot closest to 0 (consider wrap-around),
        // prefer small positive progress near 0 over values near 1,
        // and tie-break by the lowest slot (largest z).
        let best: Floater | null = null;
        let bestDistance = Infinity; // circular distance to 0: min(p, 1 - p)
        let bestProgress = Infinity; // when distance ties, prefer smaller p (just > 0)
        let bestZ = -Infinity; // final tie-break: highest z (lowest slot)

        for (let i = 0; i < this.floaters.length; i++)
        {
            const floater = this.floaters[i];
            if (floater.isTaken()) continue;

            // Skip any invalid progress to avoid NaN comparisons
            if (!Number.isFinite(floater.progress)) continue;

            const p = ((floater.progress % 1) + 1) % 1; // normalize to [0,1)
            const z = floater.node.worldPosition.z;
            const dist = Math.min(p, 1 - p); // closeness to 0 on a circle
            if (!Number.isFinite(dist)) continue;

            if (
                dist < bestDistance ||
                (dist === bestDistance && p < bestProgress) ||
                (dist === bestDistance && p === bestProgress && z > bestZ)
            )
            {
                best = floater;
                bestDistance = dist;
                bestProgress = p;
                bestZ = z;
            }
        }

        return best;
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


