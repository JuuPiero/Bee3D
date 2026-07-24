import { easing } from "cc";
import { IChangeState } from "../../designPatterns/stateMachine/BaseStateMachine";
import { ILevelController } from "../../gameplay/controllers/ILevelController";
import { GameStateBase } from "./GameStateBase";
import { EGameState } from "../../designPatterns/stateMachine/EGameState";

const INTRO_TIME = 3;
const DELAY = 0.5;

export class GameIntroState extends GameStateBase{

    private _levelController: ILevelController;
    private _timer = 0;
    private _delayTimer = 0;

    constructor(name: EGameState, stateMachine: IChangeState<EGameState>, levelController: ILevelController)
    {
        super(name, stateMachine);
        this._levelController = levelController;
    }

    public onEnter(): void {
        super.onEnter();
        this._timer = 0;
        this._delayTimer = 0;
        this._levelController.lerpCameraIntro(0);
    }

    public onUpdate(dt: number): void {
        
        if ((this._delayTimer += dt )<= DELAY)
            return;

        if (this._timer >= INTRO_TIME)
        {
            this.stateMachine.changeState(EGameState.Idle);
            return;
        }
        this._timer += dt;
        this._levelController.lerpCameraIntro(easing.quartInOut(this._timer / INTRO_TIME));
    }
}


