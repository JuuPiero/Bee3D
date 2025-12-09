import { EGameState } from "./EGameState";
import { GameStateBase } from "./GameStateBase";

export class GameTransitionState extends GameStateBase
{
    private static readonly _TRANSITION_TIME: number = 2.8;

    private timer: number = 0;

    public onEnter(): void
    {
        super.onEnter();
        this.timer = 0;
    }

    public onUpdate(dt: number): void
    {
        this.timer += dt;
        if (this.timer >= GameTransitionState._TRANSITION_TIME)
        {
            this.stateMachine.changeState(EGameState.Start);
            return;
        }
    }
}
