import { IPixelBlock } from "../../../Block/IPixelBlock";
import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

const ROTATION_SPEED = 720;

export class ShooterInConveyorShootState extends ShooterStateBase {

    private _targets : IPixelBlock[] = [];

    public onEnter(): void
    {
        this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
        this._targets = this._shooter.getTargets();
    }

    public onUpdate(dt: number): void {
        if (this._targets.length <= 0)
        {
            this.finishShootState();
            return;
        }

        this.rotateAndShoot(dt);
    }

    private rotateAndShoot(dt: number): void
    {
        const target = this._targets[0];
        if (!target || target.isMarkedForDestroy())
        {
            this._targets.shift();
            return;
        }

        const isFacingTarget = this._shooter.rotateTowardsTarget(target.getWorldPosition(), ROTATION_SPEED * dt);
        if (!isFacingTarget)
        {
            return;
        }

        this._shooter.shootTarget(target);
        this._targets.shift();
    }

    private finishShootState(): void
    {
        this._shooter.faceTheMapDirection();
        if (this._shooter.getAmmoCount() <= 0)
        {
            this._shooter.tryCompleteShooter();
            return;
        }

        this.stateMachine.changeState(EShooterState.InConveyor_Idle);
    }
}


