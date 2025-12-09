import { _decorator, game } from 'cc';
import { GameStateBase } from './GameStateBase';
import { EGameState } from './EGameState';
import { IChangeState } from '../../designPatterns/stateMachine/BaseStateMachine';
import { PromiseDelay } from '../../commons/PromiseDelay';
import { ILevelController } from '../../gameplay/controllers/ILevelController';

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
            this.levelController.clearLevel();
            await PromiseDelay.Wait(1.5);
            this.levelController.spawnLevel();
            this.stateMachine.changeState(EGameState.Idle);
        }
        catch (error)
        {
            console.error("Error during GameStartState setup:", error);
        }
    }
}


