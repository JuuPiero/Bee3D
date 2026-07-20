import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

const SEARCH_INTERVAL = 0.1;

export class ShooterInConveyorIdleState extends ShooterStateBase
{
    private _searchTimer: number = 0;

    public onEnter(): void
    {
        // this._shooter.faceTheMapDirection();    
        // this._shooter.clearPassedBlocks();
        const targets = this._shooter.findTargets();
        for (let tile of targets)
        {
            tile[0].getPixelBlock().disable();
        }
        // if (target)
        // {
        //     this.stateMachine.changeState(EShooterState.InConveyor_Shot);
        //     return;
        // }

        // if (!target)
        // {
        //     this._shooter.doNoTarget();
        // }

        // if (this.stateMachine.getLastStateName() !== EShooterState.Jump) 
        // {
        //     this._shooter.pauseAnimation();
        // }
    }

    // public onUpdate(dt: number): void
    // {
    //     this._searchTimer += dt;
    //     if (this._searchTimer < SEARCH_INTERVAL)
    //     {
    //         return;
    //     }
    //     this._searchTimer = 0;
    //     const target = this._shooter.findTarget();
    //     if (target)
    //     {
    //         this.stateMachine.changeState(EShooterState.InConveyor_Shot);
    //     }
    //     else if (this.stateMachine.getLastStateName() === EShooterState.InConveyor_Shot)
    //     {
    //         this._shooter.pauseAnimation();
    //     }
    //     if (!target)
    //     {
    //         this._shooter.doNoTarget();
    //     }
    // }

}


