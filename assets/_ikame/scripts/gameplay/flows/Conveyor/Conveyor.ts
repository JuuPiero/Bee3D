import { _decorator, Node } from 'cc';
import { SplineSmooth } from '../../../splines/SplineSmooth';
import { SplineFollowerSpeed } from '../../../splines/SplineFollowerSpeed';
import { Floater } from '../Floater/Floater';

const { ccclass, property } = _decorator;

@ccclass('Conveyor')
export class Conveyor extends SplineSmooth 
{
    @property([ Floater ]) floaters: Floater[] = [];
    @property
    
    protected onLoad(): void
    {

    }

    public init(speed: number = 5.6): void 
    {
        this.floaters = this.node.getComponentsInChildren(Floater);
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
        let best: Floater | null = null;
        let bestProgress = -1;
        let bestZ = -Infinity;

        for (let i = 0; i < this.floaters.length; i++)
        {
            const floater = this.floaters[i];
            if (floater.isTaken()) continue;

            const p = floater.progress % 1; // prefer closer to 0 after loop => maximize progress
            const z = floater.node.worldPosition.z;

            if (p > bestProgress || (p === bestProgress && z > bestZ))
            {
                best = floater;
                bestProgress = p;
                bestZ = z;
            }
        }

        return best
    }

}


