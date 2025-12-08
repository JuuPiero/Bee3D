import { BaseState } from "../../../../designPatterns/stateMachine/BaseState";
import { IChangeState } from "../../../../designPatterns/stateMachine/BaseStateMachine";
import { IShooterItem } from "../IShooterItem";
import { EShooterState } from "./EShooterState";

export class ShooterStateBase extends BaseState<EShooterState> {

    protected _shooter: IShooterItem;

    constructor(stateName: EShooterState, stateMachine: IChangeState<EShooterState>, shooter: IShooterItem)
    {
        super(stateName, stateMachine);
        this._shooter = shooter;
    }
}


