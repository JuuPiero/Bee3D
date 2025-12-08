import { _decorator, Enum } from 'cc';
import { BaseState } from './BaseState';

/**
    * @en
    * E is an Enum that represents the state name
    */
export interface IChangeState<E>
{
    changeState(stateName: E): void;    
}

/**
    * @en
    * E is an Enum that represents the state name
    */
export interface IStateHolder<E>
{
    onChangeState(stateFrom: E, toState: E): void;
}

/**
    * @en
    * E is an Enum that represents the state name
    */
export class BaseStateMachine<E> implements IChangeState<E> {
    
    public currentState: BaseState<E>;
    protected statesMap: Map<E, BaseState<E>> = new Map<E, BaseState<E>>();

    private stateHolder: IStateHolder<E>;

    constructor(stateHolder: IStateHolder<E>)
    {
        this.stateHolder = stateHolder
    }

    public init(firstState: E, states: Map<E, BaseState<E>>) : void
    {
        this.statesMap = states;
        this.currentState = this.statesMap.get(firstState);
        this.changeState(firstState, true);
    }

    public changeState(stateName: E, force: boolean = false): void
    {
        if (this.currentState && stateName == this.currentState.name && !force)
        {
            console.warn(`BaseStateMachine: Attempted to change to the same state: ${stateName}`);
            return;
        }
        this.stateHolder?.onChangeState(this.currentState?.name, stateName);
        this.currentState?.onExit();
        this.currentState = this.statesMap.get(stateName);
        this.currentState?.onEnter();
    }

    public update(dt: number): void
    {
        if(!this.currentState)
        {
            return;    
        }
        this.currentState.onUpdate(dt);
    }

    public lateUpdate(dt: number): void
    {
        if(!this.currentState)
        {
            return;    
        }
        this.currentState.onLateUpdate(dt);
    }
}


