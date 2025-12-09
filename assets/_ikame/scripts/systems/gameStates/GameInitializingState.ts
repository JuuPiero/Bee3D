import { _decorator, Component, game, Game, Node } from 'cc';
import { GameStateBase } from './GameStateBase';
import { EGameState } from './EGameState';
import { IChangeState } from '../../designPatterns/stateMachine/BaseStateMachine';
import { ILevelController } from '../../gameplay/ILevelController';

const { ccclass, property } = _decorator;

@ccclass('GameInitializingState')
export class GameInitializingState extends GameStateBase
{
    private levelController: ILevelController;

    constructor(name: EGameState, stateMachine: IChangeState<EGameState>, levelController: ILevelController)
    {
        super(name, stateMachine);
        this.levelController = levelController;
    }
    
    public onEnter(): void
    {
        super.onEnter();
        this.init();
    }

    public async init()
    {
        this.stateMachine.changeState(EGameState.Start);
    }
}


