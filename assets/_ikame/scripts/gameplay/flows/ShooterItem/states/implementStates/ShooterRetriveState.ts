import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

export class ShooterRetriveState extends ShooterStateBase
{
    public onEnter(): void
    {
        this.retriveAsync();
    }

    private async retriveAsync()
    {
        this._shooter.changeAnimation(ShooterAnimationName.Idle, false);
        await this._shooter.retrieveToCacheSlot();
        this.stateMachine.changeState(EShooterState.Ready);
    }
}


