import { PromiseDelay } from "db://assets/_ikame/scripts/commons/PromiseDelay";
import { ShooterAnimationName } from "../ShooterAnimationName";
import { ShooterStateBase } from "../ShooterStateBase";
import { EShooterState } from "../EShooterState";
import { IShooterItem } from "../../IShooterItem";
import { IChangeState } from "db://assets/_ikame/scripts/designPatterns/stateMachine/BaseStateMachine";

export class ShooterInConveyorIdleState extends ShooterStateBase
{
    private static FRAME_SIGN: boolean = false;
    private _frameSign: boolean;
    private _frameCount: number = -1;

    constructor(stateName: EShooterState, stateMachine: IChangeState<EShooterState>, shooter: IShooterItem)
    {
        super(stateName, stateMachine, shooter);
        ShooterInConveyorIdleState.FRAME_SIGN = !ShooterInConveyorIdleState.FRAME_SIGN;
        this._frameSign = ShooterInConveyorIdleState.FRAME_SIGN;

    }

    public onEnter(): void
    {
        this._shooter.faceTheMapDirection();    
        this._shooter.clearPassedBlocks();
        this._shooter.markPassedBlocks();
    }

    public onUpdate(dt: number): void
    {
        this._frameCount = (this._frameCount + 1) % 2;
        const alowUpdate = (this._frameCount === 0) === this._frameSign;

        if (alowUpdate)
        {
            const targetCount = this._shooter.tryShootTargets();
            if (targetCount > 0)
            {
                this._shooter.changeAnimation(ShooterAnimationName.Attack, true);
                this._shooter.shootSoundEffect();
                if (this._shooter.getAmmoCount() <= 0)
                {
                    this.outOfAmmoRoutine();
                }
            }
        }

        this._shooter.moveAlongConveyor(dt);
    }

    private async outOfAmmoRoutine()
    {
        await PromiseDelay.Wait(0.1);
        this._shooter.tryCompleteShooter();
    }

}


