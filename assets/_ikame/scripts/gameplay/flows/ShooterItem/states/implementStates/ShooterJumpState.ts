import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

export class ShooterJumpState extends ShooterStateBase {

    public onEnter(): void
    {
        this.jumpToConveyor();
    }

    private async jumpToConveyor() 
    {
        this._shooter.changeAnimation(ShooterAnimationName.Jump, true);
        await this._shooter.jumpToConveyor();
        this.stateMachine.changeState(EShooterState.InConveyor_Idle);
    }
}


