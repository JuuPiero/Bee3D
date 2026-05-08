import { PromiseDelay } from "db://assets/_ikame/scripts/commons/PromiseDelay";
import { IPixelBlock } from "../../../Block/IPixelBlock";
import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";
import { game } from "cc";

const FIRE_INTERVAL = 0.3;

export class ShooterInConveyorShootState extends ShooterStateBase {

    private _targets: IPixelBlock[] = [];
    private _lastFireTime = Number.MIN_VALUE;

    public onEnter(): void
    {
        this._targets = this._shooter.getTargets();
        this.rotateAndShoot();
    }

    // public onUpdate(dt: number): void {
    //     if (this._targets.length <= 0)
    //     {
    //         this.finishShootState();
    //         return;
    //     }
    // }

    private async rotateAndShoot()
    {
        while (this._targets.length > 0)
        {
            const target = this._targets.shift();
            this._shooter.pauseAnimation();
            const angle = this._shooter.getAngleDeltaToTarget(target);
            if (Math.abs(angle) > 10) 
                this._shooter.pauseAnimation();
            await this._shooter.rotateTowardsTargetAsync(angle);
            this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
            const delayTime = Math.max(0, FIRE_INTERVAL - (game.totalTime - this._lastFireTime) * 1000);
            await PromiseDelay.Wait(delayTime);
            const shootSuccess = this._shooter.shootTarget(target);
            this._lastFireTime = game.totalTime;
        }
        await PromiseDelay.Wait(.1);
        this.finishShootState();
    }

    private finishShootState(): void
    {
        if (this._shooter.getAmmoCount() <= 0)
        {
            this._shooter.tryCompleteShooter();
            return;
        }

        this.stateMachine.changeState(EShooterState.InConveyor_Idle);
    }
}


