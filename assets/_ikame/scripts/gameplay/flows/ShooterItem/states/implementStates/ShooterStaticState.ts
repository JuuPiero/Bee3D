import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

export class ShooterStaticState extends ShooterStateBase 
{
    public onEnter(): void
    {
        this._shooter.changeAnimation(ShooterAnimationName.Static, true);
    }

    public onUpdate(dt: number): void
    {
        if (this._shooter.isAtTop())
        {
            this.stateMachine.changeState(EShooterState.Ready);
        }
    }
}


