import { _decorator, game } from 'cc';
import { GameStateBase } from './GameStateBase';
import { EGameState } from './EGameState';
import { IChangeState } from '../../designPatterns/stateMachine/BaseStateMachine';
import { PromiseDelay } from '../../commons/PromiseDelay';
import { ILevelController } from '../../gameplay/controllers/ILevelController';
import { ETrackingEvent, TrackingManager } from '../../base-script/PlayableAds/Tracking/TrackingManager';

export class GameStartState extends GameStateBase {
    
    private levelController: ILevelController;

    constructor(name: EGameState, stateMachine: IChangeState<EGameState>, levelController: ILevelController)
    {
        super(name, stateMachine);
        this.levelController = levelController;
    }

    public onEnter(): void
    {
        super.onEnter();
        this.setup();
    }

    public async setup() 
    {
        try
        {
            TrackingManager.TrackEvent(ETrackingEvent.LOADING);
            this.levelController.clearLevel();
            // this.levelController.scaleLevel();
            TrackingManager.TrackEvent(ETrackingEvent.LOADED);
            TrackingManager.TrackEvent(ETrackingEvent.DISPLAYED);
            this.levelController.spawnLevel();
            await PromiseDelay.Wait(1.5);
            this.stateMachine.changeState(EGameState.Idle);
        }
        catch (error)
        {
            console.error("Error during GameStartState setup:", error);
        }
    }
}


