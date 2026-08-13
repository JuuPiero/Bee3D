import { PromiseDelay } from "db://assets/_ikame/scripts/commons/PromiseDelay";
import { EShooterState } from "../EShooterState";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";

// Unity's current GameConfig releases one collector every 0.06s. Keeping the same cadence is what makes the lanes read
// as one swarm rather than a sequence of unrelated shots.
const FIRE_INTERVAL = 0.06;

export class ShooterInConveyorShootState extends ShooterStateBase {

    public onEnter(): void
    {
        this.rotateAndShoot();
    }

    private async rotateAndShoot()
    {
        const target = this._shooter.getTargetTile();
        if (!target)
        {
            this.finishShootState();
            return;
        }

        // await this._shooter.rotateTowardsTargetAsync(this._shooter.getAngleDeltaToTile(target));

        this._shooter.pauseAnimation();
        this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
        // The bullet flies itself from here: in along a clear corridor, cube removed, then out
        // of the screen - the shooter is free to look for its next target immediately.
        this._shooter.shootTargetTile();

        await PromiseDelay.Wait(FIRE_INTERVAL);
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


