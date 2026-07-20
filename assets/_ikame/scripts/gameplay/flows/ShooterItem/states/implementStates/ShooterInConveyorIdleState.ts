import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

const SEARCH_INTERVAL = 0.1;

export class ShooterInConveyorIdleState extends ShooterStateBase
{
    private _searchTimer: number = 0;

    public onEnter(): void
    {
        const targets = this._shooter.findTargets();
        // for (let [x, d] of targets){
        //     x.disable()
        // }
        if (targets.size)
        {
            this.stateMachine.changeState(EShooterState.InConveyor_Shot);
            return;
        }

        if (!targets.size)
        {
            this._shooter.doNoTarget();
        }

        if (this.stateMachine.getLastStateName() !== EShooterState.Jump) 
        {
            this._shooter.pauseAnimation();
        }
    }

    public onUpdate(dt: number): void
    {
        this._searchTimer += dt;
        if (this._searchTimer < SEARCH_INTERVAL)
        {
            return;
        }
        this._searchTimer = 0;
        let targets = this._shooter.getTargets()
        if (targets.size) return;
        
        targets = this._shooter.findTargets();
        if (targets.size) {
            this.stateMachine.changeState(EShooterState.InConveyor_Shot);
            return;
        }

        if (!targets.size) {
            this._shooter.doNoTarget();
        }
    }

}


