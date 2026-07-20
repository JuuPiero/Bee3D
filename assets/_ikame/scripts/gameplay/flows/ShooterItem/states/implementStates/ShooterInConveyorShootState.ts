import { PromiseDelay } from "db://assets/_ikame/scripts/commons/PromiseDelay";
import { IPixelBlock } from "../../../Block/IPixelBlock";
import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";
import { game } from "cc";
import { IGridTile } from "../../../MapTiles/IGridTile";

const FIRE_INTERVAL = 0.2
export class ShooterInConveyorShootState extends ShooterStateBase {

    private _target: Map<IPixelBlock, IGridTile[]>;
    private _lastFireTime = Number.MIN_VALUE;

    public onEnter(): void
    {
        this._target = this._shooter.getTargets();
        this.rotateAndShoot();
    }

    private async rotateAndShoot()
    {
        for (let [block, path] of this._target) {
            this._shooter.pauseAnimation();
            this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
            this._shooter.moveByPathToTarget(block, path);
            await PromiseDelay.Wait(FIRE_INTERVAL);
        }
        this._target.clear();
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


