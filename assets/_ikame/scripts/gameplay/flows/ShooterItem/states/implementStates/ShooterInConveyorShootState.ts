import { IPixelBlock } from "../../../Block/IPixelBlock";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

const ROTATION_SPEED = 720;

export class ShooterInConveyorShootState extends ShooterStateBase {

    private _targets : IPixelBlock[] = [];

    public onEnter(): void
    {
        this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
        this._targets = this._shooter.findTargets();
    }

    public onUpdate(dt: number): void {

    }

    private rotateAndShoot(dt: number): void
    {
        
    }
}


