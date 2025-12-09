import { _decorator, Component, Node } from 'cc';
import { IdleScreen } from '../uis/screens/IdleScreen';
import { GameplayScreen } from '../uis/screens/GameplayScreen';
import { EndGameScreen } from '../uis/screens/EndGameScreen';
import { WinGameScreen } from '../uis/screens/WinGameScreen';
import { EmptyScreen } from '../uis/screens/EmptyScreen';
import { TransitionScreen } from '../uis/screens/TransitionScreen';
import { ScreenBase } from '../uis/screens/ScreenBase';
import { EventDispatcher } from '../designPatterns/observer/EventDispatcher';
import { EventName } from '../designPatterns/observer/EventName';
import { EGameState } from './gameStates/EGameState';
import { PromiseDelay } from '../commons/PromiseDelay';
import { Stack } from '../commons/Stack';




const { ccclass, property } = _decorator;

const FADE_DURATION = 0.2;

@ccclass('UIController')
export class UIController extends Component {

    @property(IdleScreen)
    public idleScreen: IdleScreen = null;
    
    @property(GameplayScreen)
    public gameplayScreen: GameplayScreen = null;

    @property(EndGameScreen)
    public endGame: EndGameScreen = null;

    @property(WinGameScreen)
    public winGameScreen: WinGameScreen = null;

    @property(EmptyScreen)
    public emptyScreen: EmptyScreen = null;

    @property(TransitionScreen)
    public transitionScreen: TransitionScreen = null;

    private stackStates: Stack<ScreenBase> = new Stack<ScreenBase>();

    public activeScreen: ScreenBase = null;
    
    protected onLoad(): void {
        EventDispatcher.addListener(EventName.ShowScreen, this.onShowScreen, this);
        EventDispatcher.addListener(EventName.BackScreen, this.onBackScreen, this);
    }

    protected onDestroy(): void {
        EventDispatcher.removeListener(EventName.ShowScreen, this.onShowScreen, this);
        EventDispatcher.removeListener(EventName.BackScreen, this.onBackScreen, this);
    }

    public async showScreen(screen: ScreenBase): Promise<void>
    {
        if (this.activeScreen == screen)
            return;
        this.activeScreen = screen;
        this.stackStates.forEach((scr: ScreenBase) => {
            scr.hide();
        });
        await PromiseDelay.Wait(FADE_DURATION);
        screen.show();
        this.stackStates.push(screen);
    }

    public async backState(): Promise<void>
    {
        if (this.stackStates.size() <= 0)
            return;
        const lastScreen = this.stackStates.pop();
        this.activeScreen = this.stackStates.peek();
        await lastScreen.hide();
        this.activeScreen.show();
    }

    public onShowScreen(stateName: EGameState)
    {
        // const stateName = args[0] as EGameState;
        switch (stateName) {
            case EGameState.Gameplay:
                this.showScreen(this.gameplayScreen);
                break;
            case EGameState.Win:
                this.showScreen(this.winGameScreen);
                break;
            case EGameState.Paused:
                this.showScreen(this.emptyScreen);
                break;
            case EGameState.Lose:
                this.showScreen(this.endGame);
                break;
            case EGameState.Idle:
                this.showScreen(this.idleScreen);
                break;
            case EGameState.Start:
                this.showScreen(this.emptyScreen);
                break;
            case EGameState.Transition:
                this.showScreen(this.transitionScreen);
                break;
        }
    }

    public onBackScreen()
    {
        this.backState();
    }
}


