import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

export class ShooterReadyState extends ShooterStateBase {

    public onEnter(): void
    {
        this._shooter.changeAnimation(ShooterAnimationName.Idle, true);
    }
}