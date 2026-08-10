import { EShooterState } from "../EShooterState";
import { ShooterStateBase } from "../ShooterStateBase";

const SEARCH_INTERVAL = 0.1;

export class ShooterInConveyorIdleState extends ShooterStateBase
{
    private _searchTimer: number = 0;

    public onEnter(): void
    {
        if (this.trySearchTarget()) return;

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

        this.trySearchTarget();
    }

    /**
     * Asks the cube grid for the next cube of this shooter's color. Reachability and visibility
     * both change as the pile is peeled, so a shooter with no target just keeps asking rather
     * than giving up.
     */
    private trySearchTarget(): boolean
    {
        const target = this._shooter.findTargetTile();
        if (target)
        {
            this.stateMachine.changeState(EShooterState.InConveyor_Shot);
            return true;
        }

        this._shooter.doNoTarget();
        return false;
    }
}


