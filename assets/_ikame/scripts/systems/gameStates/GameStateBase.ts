import { _decorator, Component, Node } from 'cc';
import { BaseState } from '../../designPatterns/stateMachine/BaseState';
import { EGameState } from './EGameState';
import { EventName } from '../../designPatterns/observer/EventName';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';

const { ccclass, property } = _decorator;

@ccclass('GameStateBase')
export class GameStateBase extends BaseState<EGameState>
{
    
    public onEnter(): void
    {
        EventDispatcher.dispatch(EventName.ShowScreen, this.name);
    }
}


