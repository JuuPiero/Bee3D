import { PlayableAdsManager } from "../../base-script/PlayableAds/PlayableAdsManager";
import { IChangeState } from "../../designPatterns/stateMachine/BaseStateMachine";
import { EGameState } from "../../designPatterns/stateMachine/EGameState";
import { ILevelController } from "../../gameplay/controllers/ILevelController";
import { TimerView } from "../TimerView";
import { GameStateBase } from "./GameStateBase";


export class GameplayState extends GameStateBase
{
    private _levelController: ILevelController;

    constructor(name: EGameState, stateMachine: IChangeState<EGameState>, levelController: ILevelController)
    {
        super(name, stateMachine);
        this._levelController = levelController;
    }

    public onUpdate(dt: number): void
    {
        this._levelController.doUpdate(dt);
    }

    private toStoreForce(): void 
    {
        PlayableAdsManager.Instance().ForceOpenStore();
    }
}


