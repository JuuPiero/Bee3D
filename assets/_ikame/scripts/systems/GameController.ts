import { _decorator, Component, Node } from 'cc';
import { GameStateMachine } from './gameStates/GameStateMachine';
import { GameInitializingState } from './gameStates/GameInitializingState';
import { GameStartState } from './gameStates/GameStartState';
import { GameIdleState } from './gameStates/GameIdleState';
import { GameplayState } from './gameStates/GameplayState';
import { PauseState } from './gameStates/PauseState';
import { GameOverState } from './gameStates/GameOverState';
import { WinState } from './gameStates/WinState';
import { GameStateBase } from './gameStates/GameStateBase';
import { GameTransitionState } from './gameStates/GameTransitionState';
import { IStateHolder } from '../designPatterns/stateMachine/BaseStateMachine';
import { EventName } from '../designPatterns/observer/EventName';
import { EventDispatcher } from '../designPatterns/observer/EventDispatcher';
import { ETrackingEvent, TrackingManager } from '../base-script/PlayableAds/Tracking/TrackingManager';
import { TimerView } from './TimerView';
import { LevelController } from '../gameplay/controllers/LevelController';
import { GameIntroState } from './gameStates/GameIntroState';
import { EGameState } from '../designPatterns/stateMachine/EGameState';

const { ccclass, property } = _decorator;

@ccclass('GameController')
export class GameController extends Component implements IStateHolder<EGameState>
{
    stateMachine: GameStateMachine;

    initializingState: GameInitializingState;
    gameStartState: GameStartState;
    idleState: GameIdleState;
    gameplayState: GameplayState;
    pauseState: PauseState;
    gameOverState: GameOverState;
    winGameState: WinState;
    transitionState: GameTransitionState;
    introState: GameIntroState;

    @property(LevelController)
    public levelController: LevelController;
    
    protected onLoad(): void
    {
        EventDispatcher.addListener(EventName.EndGame, this.onEndGame, this);
        EventDispatcher.addListener(EventName.ReplayGame, this.onReplayGame, this);
        EventDispatcher.addListener(EventName.ChangeGameState, this.onChangeStateTo, this);
    }

    start()
    {        
        this.stateMachine = new GameStateMachine(this);
        this.initializingState = new GameInitializingState(EGameState.Initializing, this.stateMachine, this.levelController);
        this.gameStartState = new GameStartState(EGameState.Start, this.stateMachine, this.levelController);
        this.idleState = new GameIdleState(EGameState.Idle, this.stateMachine);
        this.gameplayState = new GameplayState(EGameState.Gameplay, this.stateMachine, this.levelController);
        this.pauseState = new PauseState(EGameState.Paused, this.stateMachine);
        this.gameOverState = new GameOverState(EGameState.Lose, this.stateMachine);
        this.winGameState = new WinState(EGameState.Win, this.stateMachine);
        this.transitionState = new GameTransitionState(EGameState.Transition, this.stateMachine);
        this.introState = new GameIntroState(EGameState.Intro, this.stateMachine, this.levelController);
        const map = new Map<EGameState, GameStateBase>();
        map.set(EGameState.Initializing, this.initializingState);
        map.set(EGameState.Idle, this.idleState);
        map.set(EGameState.Start, this.gameStartState);
        map.set(EGameState.Gameplay, this.gameplayState);
        map.set(EGameState.Paused, this.pauseState);
        map.set(EGameState.Lose, this.gameOverState);
        map.set(EGameState.Win, this.winGameState);
        map.set(EGameState.Transition, this.transitionState);
        map.set(EGameState.Intro, this.introState);
        this.stateMachine.init(EGameState.Initializing, map);
    }

    private onEndGame(isWin: boolean, isLastLevel: boolean): void
    {
        if (isWin) 
        {
            if (!isLastLevel)
            {
                this.stateMachine.changeState(EGameState.Transition);
                return;
            }

            this.stateMachine.changeState(EGameState.Win);
            return;
        }
        this.stateMachine.changeState(EGameState.Lose);
    }

    onChangeState(stateFrom: EGameState, stateTo: EGameState): void
    {

    }

    private onReplayGame(): void
    {
        this.stateMachine.changeState(EGameState.Start);
    }

    protected onDestroy(): void
    {
        EventDispatcher.removeListener(EventName.EndGame, this.onEndGame, this);
        EventDispatcher.removeListener(EventName.ReplayGame, this.onReplayGame, this);
        EventDispatcher.removeListener(EventName.ChangeGameState, this.onChangeStateTo, this);
    }

    protected update(dt: number): void
    {
        this.stateMachine.update(dt);
    }

    protected lateUpdate(dt: number): void
    {
        this.stateMachine.lateUpdate(dt);
    }

    public getCurrentState(): EGameState
    {
        return this.stateMachine.currentState.name;
    }

    public onChangeStateTo(state: EGameState): void
    {
        this.stateMachine.changeState(state);
    }
}


