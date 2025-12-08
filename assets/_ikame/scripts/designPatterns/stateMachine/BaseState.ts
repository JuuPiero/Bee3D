import { _decorator } from 'cc';
import { IChangeState } from './BaseStateMachine';


/**
    * @en inherit from this class to create a new state class specific to your state machine. The E generic is the enum that represents the state name.
*/
export abstract class BaseState<E>  {
    
    public name: E;
    protected stateMachine: IChangeState<E>;

    constructor(name: E, stateMachine: IChangeState<E>)
    {
        this.name = name;
        this.stateMachine = stateMachine;
    }

    public onEnter(): void {
    }

    public onUpdate(dt: number): void {
    }

    public onLateUpdate(dt: number): void {
    }

    public onExit(): void {
    }
}


