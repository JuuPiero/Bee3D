import { PromiseDelay } from "db://assets/_ikame/scripts/commons/PromiseDelay";
import { IPixelBlock } from "../../../Block/IPixelBlock";
import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";
import { game } from "cc";
import { IGridTile } from "../../../MapTiles/IGridTile";

const FIRE_INTERVAL = 0.02
export class ShooterInConveyorShootState extends ShooterStateBase {

    private _target: IGridTile[][];
    private _lastFireTime = Number.MIN_VALUE;

    public onEnter(): void
    {
        this._target = this._shooter.getTarget();
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
        // if (this._target) {
        //     this._shooter.pauseAnimation();
        //     const angle = this._shooter.getAngleDeltaToTarget(this._target);
        //     if (Math.abs(angle) > 10)
        //         this._shooter.pauseAnimation();
        //     await this._shooter.rotateTowardsTargetAsync(angle);
        //     this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
        //     const delayTime = Math.max(0, FIRE_INTERVAL - (game.totalTime - this._lastFireTime) * 1000);
        //     // await PromiseDelay.Wait(delayTime);
        //     this._shooter.shootTarget(this._target);
        //     this._lastFireTime = game.totalTime;
        //     // if (this._targets.length > 0)
        //     //     await PromiseDelay.Wait(0.01);
        // }
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


