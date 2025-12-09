import { _decorator, CCInteger, Component, director, EventKeyboard, Input, input, KeyCode, Label, MeshRenderer, Node, Quat, SkeletalAnimation, tween, Vec3 } from 'cc';
import { Utils } from '../../../utils/Utils';
import { EDirection } from '../../../enums/EDirection';
import { SplineFollowerSpeed } from '../../../splines/SplineFollowerSpeed';
import { Shooter } from '../../../configData/LevelData';
import { IColorQueue } from '../../queues/IColorQueue';
import { ILevelController } from '../../controllers/ILevelController';
import { ColorConfig } from '../../../configData/ColorConfig';
import { ShooterStateMachine } from './states/ShooterStateMachine';
import { ShooterStaticState } from './states/implementStates/ShooterStaticState';
import { IStateHolder } from '../../../designPatterns/stateMachine/BaseStateMachine';
import { EShooterState } from './states/EShooterState';
import { ShooterReadyState } from './states/implementStates/ShooterReadyState';
import { ShooterJumpState } from './states/implementStates/ShooterJumpState';
import { ShooterInConveyorIdleState } from './states/implementStates/ShooterInConveyorIdleState';
import { ShooterInConveyorShootState } from './states/implementStates/ShooterInConveyorShootState';
import { ShooterFinishState } from './states/implementStates/ShooterFinishState';
import { ShooterStateBase } from './states/ShooterStateBase';
import { IShooterItem } from './IShooterItem';
import { PromiseDelay } from '../../../commons/PromiseDelay';
import { ShooterRetriveState } from './states/implementStates/ShooterRetriveState';
import { ICacheSlotController } from '../../cacheSlots/ICacheSlotController';
import { ShooterAnimationName } from './states/ShooterAnimationName';
const { ccclass, property } = _decorator;

const JUMP_DURATION = 0.5;
const RETREIVE_JUMP_DURATION = 0.36;

const RIGHT_ROT = new Vec3(0, -90, 0);
const LEFT_ROT = new Vec3(0, 90, 0);

@ccclass('ShooterItem')
export class ShooterItem extends SplineFollowerSpeed implements IStateHolder<EShooterState>, IShooterItem {
    
    @property(CCInteger) public colorID: number = -1;

    private _levelController: ILevelController = null;
    private _colorQueue: IColorQueue = null;
    private _cacheSlotController: ICacheSlotController;

    private _passedBlockCoords: Set<string> = new Set<string>();

    @property(MeshRenderer)
    private characterMesh: MeshRenderer = null;
    
    @property(ColorConfig)
    public colorConfig: ColorConfig = null;

    @property(Node)
    public characterRoot : Node = null;

    private _ammoCount: number = 0;
    private _cacheSlotIndex: number = -1;

    @property(SkeletalAnimation) animator: SkeletalAnimation = null;
    private _curAnimationName: string = "";

    private _stateMachine: ShooterStateMachine;
    private _staticState: ShooterStaticState;
    private _readyState: ShooterStaticState;
    private _jumpState: ShooterStaticState;
    private _inConveyorIdleState: ShooterStaticState;
    private _inConveyorShotState: ShooterStaticState;
    private _retrieveState: ShooterStaticState;
    private _finishState: ShooterStaticState;

    private _jumpToPosition: Vec3 = new Vec3();
    private _jumpToQuat: Quat = new Quat();
    private _startJumpPosition: Vec3 = new Vec3();
    private _lerpPos = new Vec3();

    private _targetCount: number = 0;

    private _floaterNode: Node = null;
    
    @property(Node) private firePointNode: Node = null;

    public reduceAmmoCount(): number {
        this._ammoCount = Math.max(0, this._ammoCount - 1);
        this.ammoLabel.string = this._ammoCount.toString();
        return this._ammoCount;
    }
    
    @property(Label) private ammoLabel: Label = null;

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

    public tryShootTargets(): boolean
    {
        if (this._ammoCount <= 0)
        {
            return false;
        }
        this._targetCount = 0;
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
        return this._targetCount > 0;
    }

    private shotTargetsBottom(): number 
    {
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
            if (!protentialTileTarget.isContainBlock())
            {
                // Dig Upwards
                let upLinkedTile = protentialTileTarget.getTopLinkedTile();
                while (upLinkedTile)
                {
                    if (upLinkedTile.isContainBlock() || upLinkedTile.isMatchingColorID(this.colorID))
                    {
                        protentialTileTarget = upLinkedTile;
                        break;
                    }
                    upLinkedTile = upLinkedTile.getTopLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            if (!targetBlock || targetBlock.getColorID() !== this.colorID)
            {
                x--;
                continue;
            }
            this.markBlockAsPassed(x, z);
            targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            this._targetCount++;
            x--;
        }
    }

    private shotTargetsTop(): number 
    {
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
            if (!protentialTileTarget.isContainBlock())
            {
                // Dig Downwards from top
                let downLinkedTile = protentialTileTarget.getBottomLinkedTile();
                while (downLinkedTile)
                {
                    if (downLinkedTile.isContainBlock() || downLinkedTile.isMatchingColorID(this.colorID))
                    {
                        protentialTileTarget = downLinkedTile;
                        break;
                    }
                    downLinkedTile = downLinkedTile.getBottomLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            if (!targetBlock || targetBlock.getColorID() !== this.colorID)
            {
                x++;
                continue;
            }
            this.markBlockAsPassed(x, z);
            targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            this._targetCount++;
            x++;
        }
    }

    private shotTargetsLeft(): number 
    {
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
            if (!protentialTileTarget.isContainBlock())
            {
                // Dig Rightwards from left edge
                let rightLinkedTile = protentialTileTarget.getRightLinkedTile();
                while (rightLinkedTile)
                {
                    if (rightLinkedTile.isContainBlock() || rightLinkedTile.isMatchingColorID(this.colorID))
                    {
                        protentialTileTarget = rightLinkedTile;
                        break;
                    }
                    rightLinkedTile = rightLinkedTile.getRightLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            if (!targetBlock || targetBlock.getColorID() !== this.colorID)
            {
                z--;
                continue;
            }
            this.markBlockAsPassed(x, z);
            targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            this._targetCount++;
            z--;
        }
    }

    private shotTargetsRight(): number 
    {
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
            if (!protentialTileTarget.isContainBlock())
            {
                // Dig Leftwards from right edge
                let leftLinkedTile = protentialTileTarget.getLeftLinkedTile();
                while (leftLinkedTile)
                {
                    if (leftLinkedTile.isContainBlock() || leftLinkedTile.isMatchingColorID(this.colorID))
                    {
                        protentialTileTarget = leftLinkedTile;
                        break;
                    }
                    leftLinkedTile = leftLinkedTile.getLeftLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            if (!targetBlock || targetBlock.getColorID() !== this.colorID)
            {
                z++;
                continue;
            }
            this.markBlockAsPassed(x, z);
            targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            this._targetCount++;
            z++;
        }
    }


    public init(shooterData: Shooter, colorQueue: IColorQueue, levelController: ILevelController): void
    {
        this.spline = levelController.getSpline();
        this._cacheSlotController = levelController.getCacheSlotController();
        this.colorID = shooterData.material;
        this._colorQueue = colorQueue;
        this._levelController = levelController;
        this._ammoCount = shooterData.ammo;
        this.ammoLabel.string = this._ammoCount.toString();
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

        this._stateMachine.update(deltaTime);
    }

    protected lateUpdate(dt: number): void
    {
        this._stateMachine.lateUpdate(dt);
    }

    public onTouchShooter(): boolean
    {
        if (this._cacheSlotIndex >= 0 && this._stateMachine.currentState.name === EShooterState.Ready)
        {
            this._stateMachine.changeState(EShooterState.Jump);
            return true;
        }

        if (!this.isAtTop() || this._stateMachine.currentState.name !== EShooterState.Ready) 
        {
            return false;
        }
        this._stateMachine.changeState(EShooterState.Jump);
        return true;
    }

    changeAnimation(animationName: string, force: boolean): void
    {
        if (this._curAnimationName === animationName && !force)
        {
            return;
        }
        this.animator.play(animationName);
        this._curAnimationName = animationName;
    }

    onChangeState(stateFrom: EShooterState, toState: EShooterState): void
    {
        
    }

    public isAtTop(): boolean
    {
        return this._colorQueue.isOnTop(this);
    }

    public async jumpToConveyor(): Promise<void>
    {
        try
        {
            this._floaterNode = this._levelController.getFloaterToStream();
            if (this._cacheSlotIndex >= 0)
            {
                const curSlot = this._cacheSlotController.getSlotAtIndex(this._cacheSlotIndex);
                curSlot.removeShooter();
            }
            this.progress = 0;
            this._cacheSlotIndex = -1;
            const scene = director.getScene();
            this.node.setParent(scene, true);
            this._colorQueue.removeShooter(this);
            this.spline.getPercentageTransform(0, this._jumpToPosition, this._jumpToQuat);
            this.node.getWorldPosition(this._startJumpPosition);
            const tweenObj = { progress: 0 }
            const tweenJump = tween(tweenObj)
                .to(JUMP_DURATION, { progress: 1 }, {
                    onUpdate: (target: any, ratio: number) =>
                    {
                        Vec3.lerp(this._lerpPos, this._startJumpPosition, this._jumpToPosition, target.progress)
                        this.node.setWorldPosition(this._lerpPos);
                    }
                })
                .start();
            return PromiseDelay.Wait(tweenJump.duration);
        }
        catch (error)
        {
            console.error("Error during jumpToConveyor:", error);
            return Promise.resolve();
        }
    }

    public moveAlongConveyor(dt: number): void
    {
        this.updatePosition(dt);
        if (this._floaterNode)
            this._floaterNode.setWorldPosition(this.node.getWorldPosition());
    }

    public faceTheMapDirection(): void
    {
        this.characterRoot.setRotationFromEuler(0, -90, 0);
    }

    public onCompleteLoop(): void
    {
        this._stateMachine.changeState(EShooterState.Retrieve);
        this.returnFloaterToPool();
    }

    private returnFloaterToPool(): void
    {
        if (this._floaterNode)
        {
            this._levelController.returnFloaterToPool(this._floaterNode);
            this._floaterNode = null;
        }
    }

    setCacheSlot(slotIndex: number, isJump: boolean): void
    {
        this._cacheSlotIndex = slotIndex;
        if (isJump)
        {
            this.condenseToCacheSlot();
        }
    }

    private async condenseToCacheSlot()
    {
        // TODO: Implement jump to cache slot logic
    }

    public async retrieveToCacheSlot(): Promise<void>
    {
        const targetSlot = this._cacheSlotController.getNextEmptySlot();
        if (!targetSlot) {
            this._levelController.lose();
            return;
        }
        targetSlot.setShooter(this);
        this._cacheSlotIndex = targetSlot.getIndex();
        this.resetRotation();
        // Jump to target slot using tween with sine-based height
        const targetPosition = targetSlot.node.worldPosition.clone();
        const startPosition = this.node.worldPosition.clone();
        const jumpHeight = 2; // Adjust this value for desired arc height
        const tweenObj = { progress: 0 };
        const tweenJump = tween(tweenObj)
            .to(RETREIVE_JUMP_DURATION, { progress: 1 }, {
                onUpdate: (target: any, ratio: number) =>
                {
                    Vec3.lerp(this._lerpPos, startPosition, targetPosition, target.progress);
                    // Add height using sine wave for smooth arc
                    const heightOffset = Math.sin(target.progress * Math.PI) * jumpHeight;
                    this._lerpPos.y += heightOffset;
                    this.node.setWorldPosition(this._lerpPos);
                }
            })
            .start();
        
        await PromiseDelay.Wait(tweenJump.duration);
    }

    private resetRotation(): void 
    {
        this.characterRoot.setRotationFromEuler(0, 0, 0);
    }

    getAmmoCount(): number
    {
        return this._ammoCount;
    }

    public async finishAnimation(): Promise<void> 
    {
        this.returnFloaterToPool();

        const isRight = this.node.worldPositionX > 0;
        const startPosition = this.node.worldPosition.clone();
        const targetPosition = new Vec3(isRight ? startPosition.x + 7 : startPosition.x - 7, startPosition.y + 5, startPosition.z);
        const rot = isRight ? RIGHT_ROT : LEFT_ROT;
        this.characterRoot.setWorldRotationFromEuler(rot.x, rot.y, rot.z);
        this.changeAnimation(ShooterAnimationName.Jump, true);
        
        const jumpHeight = 2;
        const tweenObj = { progress: 0 };
        this.ammoLabel.node.active = false;
        const tweenJump = tween(tweenObj)
            // .delay(0.03)
            .to(JUMP_DURATION, { progress: 1 }, {
                onUpdate: (target: any, ratio: number) =>
                {
                    Vec3.lerp(this._lerpPos, startPosition, targetPosition, target.progress);
                    const heightOffset = Math.sin(target.progress * Math.PI) * jumpHeight;
                    this._lerpPos.y += heightOffset;
                    this.node.setWorldPosition(this._lerpPos);
                }
            })
            .start();

        await PromiseDelay.Wait(tweenJump.duration);
        this.node.active = false;
    }
}


