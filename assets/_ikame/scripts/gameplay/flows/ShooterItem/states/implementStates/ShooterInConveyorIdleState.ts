import { PromiseDelay } from "db://assets/_ikame/scripts/commons/PromiseDelay";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";
import { EShooterState } from "../EShooterState";

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
            this._shooter.reduceAmmoCount();
            this._shooter.shootSoundEffect();
            if (this._shooter.getAmmoCount() <= 0)
            {
                this.outOfAmmoRoutine();
            }
        }
        if (this._shooter.getAmmoCount() > 0)
            this._shooter.moveAlongConveyor(dt);
    }

    private async outOfAmmoRoutine()
    {
        await PromiseDelay.Wait(0.1);
        this.stateMachine.changeState(EShooterState.Finish);
    }

}


