
import { EventDispatcher } from "../../designPatterns/observer/EventDispatcher";
import { EventName } from "../../designPatterns/observer/EventName";
import { GameStateBase } from "./GameStateBase";

export class PauseState extends GameStateBase {
    
    public onEnter(): void {
        super.onEnter();
        EventDispatcher.dispatch(EventName.Pause, true);
    }

    public onExit(): void {
        EventDispatcher.dispatch(EventName.BackScreen, this.name);
        EventDispatcher.dispatch(EventName.Pause, false);
    }
}


