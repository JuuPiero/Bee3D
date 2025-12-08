import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

export class ShooterInConveyorIdleState extends ShooterStateBase
{
    
    public onEnter(): void
    {
        this._shooter.faceTheMapDirection();        
    }

    public onUpdate(dt: number): void
    {
        if (this._shooter.tryShootTargets())
        {
            this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
        }
        this._shooter.moveAlongConveyor(dt);
    }

}


