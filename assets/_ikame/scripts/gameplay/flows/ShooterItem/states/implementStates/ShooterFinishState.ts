import { ShooterStateBase } from "../ShooterStateBase";

export class ShooterFinishState extends ShooterStateBase {
    public onEnter(): void
    {
        this._shooter.finishAnimation();
    }
}


