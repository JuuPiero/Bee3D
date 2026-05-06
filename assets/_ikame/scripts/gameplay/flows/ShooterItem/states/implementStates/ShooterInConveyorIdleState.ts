import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

const SEARCH_INTERVAL = 0.1;

export class ShooterInConveyorIdleState extends ShooterStateBase
{
    private _searchTimer: number = 0;

    public onEnter(): void
    {
        this._shooter.faceTheMapDirection();    
        this._shooter.clearPassedBlocks();

        this._shooter.changeAnimation(ShooterAnimationName.Idle, true);
    }

    public onUpdate(dt: number): void
    {
        this._searchTimer += dt;
        if (this._searchTimer < SEARCH_INTERVAL)
        {
            return;
        }
        this._searchTimer = 0;
        const targets = this._shooter.findTargets();
        if (targets.length > 0)
        {
            this.stateMachine.changeState(EShooterState.InConveyor_Shot);
        }
    }

}


