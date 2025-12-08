import { _decorator, CCInteger, Component, EventKeyboard, Input, input, KeyCode, MeshRenderer, Node } from 'cc';
import { Utils } from '../../../utils/Utils';
import { EDirection } from '../../../enums/EDirection';
import { SplineFollowerSpeed } from '../../../splines/SplineFollowerSpeed';
import { Shooter } from '../../../configData/LevelData';
import { IColorQueue } from '../../queues/IColorQueue';
import { ILevelController } from '../../controllers/ILevelController';
import { ColorConfig } from '../../../configData/ColorConfig';
import { SplineSmooth } from '../../../splines/SplineSmooth';
import { ShooterStateMachine } from './states/ShooterStateMachine';
import { ShooterStaticState } from './states/implementStates/ShooterStaticState';
import { IStateHolder } from '../../../designPatterns/stateMachine/BaseStateMachine';
import { EShooterState } from './states/EShooterState';
import { ShooterReadyState } from './states/implementStates/ShooterReadyState';
import { ShooterJumpState } from './states/implementStates/ShooterJumpState';
import { ShooterInConveyorIdleState } from './states/implementStates/ShooterInConveyorIdleState';
import { ShooterInConveyorShootState } from './states/implementStates/ShooterInConveyorShootState';
import ShooterRetriveState from './states/implementStates/ShooterRetriveState';
import { ShooterFinishState } from './states/implementStates/ShooterFinishState';
import { ShooterStateBase } from './states/ShooterStateBase';
const { ccclass, property } = _decorator;

@ccclass('ShooterItem')
export class ShooterItem extends SplineFollowerSpeed implements IStateHolder<EShooterState> {
    
    @property(CCInteger) public colorID: number = -1;

    public _levelController: ILevelController = null;
    public _colorQueue: IColorQueue = null;

    private _passedBlockCoords: Set<string> = new Set<string>();

    @property(MeshRenderer)
    private characterMesh: MeshRenderer = null;
    
    @property(ColorConfig)
    public colorConfig: ColorConfig = null;

    private _ammoCount: number = 0;

    private _stateMachine: ShooterStateMachine;
    private _staticState: ShooterStaticState;
    private _readyState: ShooterStaticState;
    private _jumpState: ShooterStaticState;
    private _inConveyorIdleState: ShooterStaticState;
    private _inConveyorShotState: ShooterStaticState;
    private _retrieveState: ShooterStaticState;
    private _finishState: ShooterStaticState;

    public markBlockAsPassed(x: number, z: number): void {
        const key = Utils.generateKeyFromCoord(x, z);
        this._passedBlockCoords.add(key);
    }

    public hasPassedBlock(x: number, z: number): boolean {
        const key = Utils.generateKeyFromCoord(x, z);
        return this._passedBlockCoords.has(key);
    }

    public clearPassedBlocks(): void {
        this._passedBlockCoords.clear();
    }

    protected start(): void
    {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    protected onDestroy(): void
    {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: EventKeyboard): void
    {
        // Example key handling logic
        if(event.keyCode === KeyCode.SPACE)
        {
            this.tryShootTargets();
        }
    }

    private tryShootTargets(): void
    {
        // Implement shooting logic here
        const edge = this._levelController.getShooterEdge(this.node.worldPosition.x, this.node.worldPosition.z);
        switch (edge)
        {
            case EDirection.BOTTOM:
                this.shotTargetsBottom();
                break;
            case EDirection.TOP:
                this.shotTargetsTop();
                break;
            case EDirection.LEFT:
                this.shotTargetsLeft();
                break;
            case EDirection.RIGHT:
                this.shotTargetsRight();
                break;
        }
    }

    private shotTargetsBottom(): void 
    {
        console.log("Shooting BOTTOM");
        const z = this._levelController.getLevelHeight() - 1;
        let x = this._levelController.getLevelWidth() - 1;
        while (x >= 0)
        {
            if (this.hasPassedBlock(x, z))
            {
                x--;
                continue;
            }
            let protentialTileTarget = this._levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {  
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosX() > this.node.worldPositionX)
            {
                x--;
                continue;
            }
            this.markBlockAsPassed(x, z);
            if (!protentialTileTarget.isOccupied())
            {
                // Dig Upwards
                let upLinkedTile = protentialTileTarget.getTopLinkedTile();
                while (upLinkedTile)
                {
                    if (upLinkedTile.isOccupied())
                    {
                        protentialTileTarget = upLinkedTile;
                        break;
                    }
                    upLinkedTile = upLinkedTile.getTopLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block 2 at: ", targetBlock.getUid());
            targetBlock.markForDestroy();
            x--;
        }
        console.log("----");
    }

    private shotTargetsTop(): void 
    {
        console.log("Shooting TOP");
        const z = 0;
        let x = 0;
        while (x < this._levelController.getLevelWidth() )
        {
            if (this.hasPassedBlock(x, z))
            {
                x++;
                continue;
            }
            let protentialTileTarget = this._levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosX() < this.node.worldPositionX)
            {
                x++;
                continue;
            }
            this.markBlockAsPassed(x, z);
            if (!protentialTileTarget.isOccupied())
            {
                // Dig Downwards from top
                let downLinkedTile = protentialTileTarget.getBottomLinkedTile();
                while (downLinkedTile)
                {
                    if (downLinkedTile.isOccupied())
                    {
                        protentialTileTarget = downLinkedTile;
                        break;
                    }
                    downLinkedTile = downLinkedTile.getBottomLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block TOP at:", targetBlock.getUid());
            targetBlock.markForDestroy();
            x++;
        }
        console.log("----");
    }

    private shotTargetsLeft(): void 
    {
        console.log("Shooting LEFT");
        const x = 0;
        let z = this._levelController.getLevelHeight() - 1;
        while (z >= 0)
        {
            if (this.hasPassedBlock(x, z))
            {
                z--;
                continue;
            }
            let protentialTileTarget = this._levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosZ() > this.node.worldPositionZ)
            {
                z--;
                continue;
            }
            this.markBlockAsPassed(x, z);
            if (!protentialTileTarget.isOccupied())
            {
                // Dig Rightwards from left edge
                let rightLinkedTile = protentialTileTarget.getRightLinkedTile();
                while (rightLinkedTile)
                {
                    if (rightLinkedTile.isOccupied())
                    {
                        protentialTileTarget = rightLinkedTile;
                        break;
                    }
                    rightLinkedTile = rightLinkedTile.getRightLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block LEFT at:", targetBlock.getUid());
            targetBlock.markForDestroy();
            z--;
        }
        console.log("----");
    }

    private shotTargetsRight(): void 
    {
        console.log("Shooting RIGHT");
        const x = this._levelController.getLevelWidth() - 1;
        let z = 0;
        while (z >= 0 && z < this._levelController.getLevelHeight())
        {
            if (this.hasPassedBlock(x, z))
            {
                z++;
                continue;
            }
            let protentialTileTarget = this._levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosZ() < this.node.worldPositionZ)
            {
                z++;
                continue;
            }
            this.markBlockAsPassed(x, z);
            if (!protentialTileTarget.isOccupied())
            {
                // Dig Leftwards from right edge
                let leftLinkedTile = protentialTileTarget.getLeftLinkedTile();
                while (leftLinkedTile)
                {
                    if (leftLinkedTile.isOccupied())
                    {
                        protentialTileTarget = leftLinkedTile;
                        break;
                    }
                    leftLinkedTile = leftLinkedTile.getLeftLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block RIGHT at:", targetBlock.getUid());
            targetBlock.markForDestroy();
            z++;
        }
        console.log("----");
    }


    public init(shooterData: Shooter, colorQueue: IColorQueue, levelController: ILevelController): void
    {
        this.spline = levelController.getSpline();
        this.colorID = shooterData.material;
        this._colorQueue = colorQueue;
        this._levelController = levelController;
        this._ammoCount = shooterData.ammo;
        const mat = this.colorConfig.getShooterColorById(shooterData.material);
        this.characterMesh.setSharedMaterial(mat, 0);

        this._stateMachine = new ShooterStateMachine(this);
        const map = new Map<EShooterState, ShooterStateBase>();
        // Initialize states here and add to state machine
        this._staticState = new ShooterStaticState(EShooterState.Static, this._stateMachine, this);
        this._readyState = new ShooterReadyState(EShooterState.Ready, this._stateMachine, this);
        this._jumpState = new ShooterJumpState(EShooterState.Jump, this._stateMachine, this);
        this._inConveyorIdleState = new ShooterInConveyorIdleState(EShooterState.InConveyor_Idle, this._stateMachine, this);
        this._inConveyorShotState = new ShooterInConveyorShootState(EShooterState.InConveyor_Shot, this._stateMachine, this);
        this._retrieveState = new ShooterRetriveState(EShooterState.Retrieve, this._stateMachine, this);
        this._finishState = new ShooterFinishState(EShooterState.Finish, this._stateMachine, this);
        map.set(EShooterState.Static, this._staticState);
        map.set(EShooterState.Ready, this._readyState);
        map.set(EShooterState.Jump, this._jumpState);
        map.set(EShooterState.InConveyor_Idle, this._inConveyorIdleState);
        map.set(EShooterState.InConveyor_Shot, this._inConveyorShotState);
        map.set(EShooterState.Retrieve, this._retrieveState);
        map.set(EShooterState.Finish, this._finishState);
        this._stateMachine.init(EShooterState.Static, map);
        // Similarly initialize other states...
    }

    protected update(deltaTime: number): void
    {
        // super.update(deltaTime);
        // this.tryShootTargets();
    }

    public onTouchShooter(): void
    {
        if (this._colorQueue.isOnTop(this))
        {
            console.log("Shooter touched and is on top, ready to shoot!");
        }
    }

    onChangeState(stateFrom: EShooterState, toState: EShooterState): void
    {
        
    }
}


