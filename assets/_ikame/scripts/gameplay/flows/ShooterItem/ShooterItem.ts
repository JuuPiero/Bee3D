import { _decorator, AudioClip, CCFloat, CCInteger, director, easing, EventKeyboard, Input, input, KeyCode, Label, MeshRenderer, Node, ParticleSystem, Quat, SkeletalAnimation, Tween, tween, Vec2, Vec3 } from 'cc';
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
import { EventDispatcher } from '../../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../../designPatterns/observer/EventName';
import { Queue } from '../../../commons/Queue';
import { EColor } from '../../../enums/EColor';
import { LinkedConnection } from './LinkedConnection/LinkedCollection';
import { PREVIEW } from 'cc/env';
const { ccclass, property } = _decorator;

const JUMP_DURATION = 0.45;
const RETREIVE_JUMP_DURATION = 0.32;

const RIGHT_ROT = new Vec3(0, -90, 0);
const LEFT_ROT = new Vec3(0, 90, 0);

const JUMP_OFFSET_DURATION = 0.23

@ccclass('ShooterItem')
export class ShooterItem extends SplineFollowerSpeed implements IStateHolder<EShooterState>, IShooterItem {
    
    @property([ LinkedConnection ]) connections: LinkedConnection[] = [];

    @property(CCFloat   )
    public id : number = -1;

    static JumpToConveyorQueue: Queue<ShooterItem> = new Queue<ShooterItem>();

    @property(CCInteger) public colorID: number = -1;

    private _levelController: ILevelController = null;
    private _colorQueue: IColorQueue = null;
    private _cacheSlotController: ICacheSlotController;

    private _passedBlockCoords: Set<string> = new Set<string>();

    @property([ MeshRenderer ])
    private characterMeshs: MeshRenderer[] = [];
    
    @property(ColorConfig)
    public colorConfig: ColorConfig = null;

    @property(Node)
    public characterRoot : Node = null;

    private _ammoCount: number = 0;
    private _ammoDisplayCount: number = 0;
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

    @property(AudioClip)
    public shootSound: AudioClip = null;

    @property(AudioClip)
    public jumpSound: AudioClip = null;

    @property(AudioClip)
    public finishSound1: AudioClip = null;
    @property(AudioClip)
    public finishSound2: AudioClip = null;
    @property(AudioClip)
    public retrieveSound: AudioClip = null;

    @property([ ParticleSystem ])
    waterParticles: ParticleSystem[] = [];

    @property(CCFloat)
    private fastSpeed: number = 0;

    private _firstChainShooter: IShooterItem = null;
    private _rightLinkedShooter: IShooterItem | null = null;

    @property(Node)
    private connectionRoot: Node = null;

    public setLinkedShooters(shooterLeft: IShooterItem, shooterRight: IShooterItem, firstChainShooter: IShooterItem): void
    {
        console.log("Setting linked shooters for shooter ID:", this.id, "Left:", shooterLeft ? shooterLeft : "null", "Right:", shooterRight ? shooterRight : "null");
        if (shooterLeft)
        {
            this.connections[ 0 ].setTargetNode(shooterLeft.getLinkedWirePoint());
            this.connections[ 0 ].node.active = true;
        }
        if (shooterRight)
        {
            this.connections[ this.connections.length - 1 ].setTargetNode(shooterRight.getLinkedWirePoint());
            this.connections[ this.connections.length - 1 ].node.active = true;
        }

        this._firstChainShooter = firstChainShooter;
        this._rightLinkedShooter = shooterRight;
        if (this._firstChainShooter)
        {
            this.connectionRoot.active = true;
        }
    }

    public reduceAmmoCount(amount: number): number
    {
        this._ammoCount = Math.max(0, this._ammoCount - amount);
        const count = this._ammoDisplayCount < this._ammoCount ? this._ammoDisplayCount : this._ammoCount;
        this.ammoLabel.string = count.toString();
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
        EventDispatcher.addListener(EventName.ZeroRemainInQueue, this.speedUp, this);
    }

    private speedUp(): void
    {
        this.speed = this.fastSpeed;
    }

    protected onDestroy(): void
    {
        EventDispatcher.addListener(EventName.ZeroRemainInQueue, this.speedUp, this);
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

    public tryShootTargets(): number
    {
        if (this._ammoCount <= 0)
        {
            return 0;
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
        return this._targetCount;
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
                this.markBlockAsPassed(x, z);
                x--;
                continue;
            }
            
            // Đánh dấu cả tile gốc và tile chứa block thực sự
            this.markBlockAsPassed(x, z);
            this.markBlockAsPassed(protentialTileTarget.getCoordX(), protentialTileTarget.getCoordZ());
            
            const canBeTargeted = targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            if (canBeTargeted) {
                this._targetCount++;
            }
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

            this.markBlockAsPassed(x, z);

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
            const canBeTargeted = targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            if (canBeTargeted) {
                this._targetCount++;
            }
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

            this.markBlockAsPassed(x, z);

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
            const canBeTargeted = targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            if (canBeTargeted) {
                this._targetCount++;
            }
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

            this.markBlockAsPassed(x, z);

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
            const canBeTargeted = targetBlock.markForDestroy(this.firePointNode.getWorldPosition());
            if (canBeTargeted) {
                this._targetCount++;
            }
            z++;
        }
    }

    public init(shooterData: Shooter, colorQueue: IColorQueue, levelController: ILevelController): void
    {
        this.id = shooterData.id;
        this.spline = levelController.getSpline();
        this._cacheSlotController = levelController.getCacheSlotController();
        this.colorID = shooterData.material;
        this._colorQueue = colorQueue;
        this._levelController = levelController;
        this._ammoCount = shooterData.ammo;
        this._ammoDisplayCount = this._ammoCount - this._ammoCount % 10;
        if (this._ammoDisplayCount < 10) this._ammoDisplayCount = 10;
        this.ammoLabel.string = this._ammoDisplayCount.toString();
        const mat = this.colorConfig.getShooterColorById(shooterData.material);
        if (PREVIEW)
        {
            if (!mat) console.warn("Material not found for colorID:", EColor[shooterData.material]);
        }
        this.characterMeshs.forEach(mesh => mesh.setSharedMaterial(mat, 0));

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

        this._levelController.addToShooterMap(this.id, this);
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

    public onTouchShooter(remainCount: number): boolean
    {
        if (this.canJumpToConveyor(remainCount))
        {
            if (this._firstChainShooter)
            {
                let shooter: IShooterItem = this._firstChainShooter;
                while (shooter)
                {
                    shooter.changeState(EShooterState.Jump);
                    shooter = shooter.getRightLinkedShooter();
                }
            }
            else 
            {
                this.changeState(EShooterState.Jump);
            }
            return true;
        }
        return false;
    }

    changeAnimation(animationName: string, force: boolean): void
    {
        if (this._curAnimationName === animationName && !force)
        {
            return;
        }
        const fromCache = this._cacheSlotIndex >= 0;
        const newJumpDuration = JUMP_DURATION * (fromCache ? 0.5 : 1) + ShooterItem.JumpToConveyorQueue.size() * JUMP_OFFSET_DURATION;
        const scale = newJumpDuration / JUMP_DURATION;

        this.animator.getState(animationName).speed = animationName === ShooterAnimationName.Jump ? 1 / scale : 1;
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
            this._cacheSlotController.removeFromCache(this);
            const inQueueCount = ShooterItem.JumpToConveyorQueue.size();
            ShooterItem.JumpToConveyorQueue.enqueue(this);
            EventDispatcher.dispatch(EventName.PlaySFX, this.jumpSound);
            this._floaterNode = this._levelController.getFloaterToStream();
            this.progress = 0;
            this._cacheSlotIndex = -1;
            const scene = director.getScene();
            this.node.setParent(scene, true);
            this._colorQueue.removeShooter(this);
            this.spline.getPercentageTransform(0, this._jumpToPosition, this._jumpToQuat);
            this.node.getWorldPosition(this._startJumpPosition);
            const tweenObj = { progress: 0 }
            const tweenJump = tween(tweenObj)
                .to(JUMP_DURATION + (inQueueCount * JUMP_OFFSET_DURATION), { progress: 1 }, {
                    onUpdate: (target: any, ratio: number) =>
                    {
                        Vec3.lerp(this._lerpPos, this._startJumpPosition, this._jumpToPosition, target.progress)
                        this.node.setWorldPosition(this._lerpPos);
                    }
                })
                .start();
            await PromiseDelay.Wait(tweenJump.duration);
            ShooterItem.JumpToConveyorQueue.dequeue();
            this.playWaterParticles();

            const remainCount = this._levelController.getRemainCount();
            if (remainCount <= 0)
                EventDispatcher
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
        this.changeState(EShooterState.Retrieve);
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

    private _tweenRetrieve: Tween<any>;

    public async retrieveToCacheSlot(): Promise<void>
    {
        const targetPosition = this._cacheSlotController.getNextEmptyPosition();
        if (!targetPosition) {
            this._levelController.lose();
            return;
        }
        if (this._tweenShuffle)
        {
            this._tweenShuffle.stop();
        }
        this.playWaterParticles();
        EventDispatcher.dispatch(EventName.PlaySFX, this.retrieveSound);
        this.resetRotation();
        this._cacheSlotController.addToCache(this);
        // Jump to target slot using tween with sine-based height
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
        this._tweenRetrieve = tweenJump;
        await PromiseDelay.Wait(tweenJump.duration + 0.03);

        this._cacheSlotController.compactCache();
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
        this._cacheSlotController.removeFromCache(this);
        this.returnFloaterToPool();
        this.playWaterParticles();
        const isRight = this.node.worldPositionX > 0;
        const startPosition = this.node.worldPosition.clone();
        const targetPosition = new Vec3(isRight ? startPosition.x + 7 : startPosition.x - 7, startPosition.y + 5, startPosition.z);
        const rot = isRight ? RIGHT_ROT : LEFT_ROT;
        this.characterRoot.setWorldRotationFromEuler(rot.x, rot.y, rot.z);
        this.changeAnimation(ShooterAnimationName.Jump, true);
        const winSound = isRight ? this.finishSound1 : this.finishSound2;
        EventDispatcher.dispatch(EventName.PlaySFX, winSound, 0.5);
        const jumpHeight = 2;
        const tweenObj = { progress: 0 };
        this.ammoLabel.node.active = false;
        const tweenJump = tween(tweenObj)
            // .delay(0.03)
            .to(JUMP_DURATION * 2, { progress: 1 }, {
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

    public shootSoundEffect(): void
    {
        EventDispatcher.dispatch(EventName.PlaySFX, this.shootSound);
    }

    public playWaterParticles(): void
    {
        this.waterParticles.forEach(particle =>
        {
            particle.stop();
            particle.clear();
            particle.play();
        });
    }

    private _tweenShuffle: Tween<any>;

    private _shuffleUpdateActive: boolean = false;
    private _shuffleUpdateProgress: number = 0;
    private _shuffleUpdateDuration: number = 0.3;
    private _shuffleUpdateHeight: number = 1.5;
    private _shuffleUpdateStartPos: Vec3 = new Vec3();
    private _shuffleUpdateTargetPos: Vec3 = new Vec3();
    private _shuffleUpdateIndex: number = -1;

    public shuffleToCache(pos: Vec3, index: number): void
    {
        const v2 = new Vec2(this.node.worldPosition.x, this.node.worldPosition.z);
        const v2Target = new Vec2(pos.x, pos.z);
        const distanceToTarget = Vec2.distance(v2, v2Target);

        if (this._tweenRetrieve && this._tweenRetrieve.running)
            return;
        if (distanceToTarget < 0.1)
            return;
        if (this._tweenRetrieve && this._tweenRetrieve.running && this._cacheSlotIndex === index)
        {
            return;
        }
        if (this._tweenShuffle)
        {
            this._tweenShuffle.stop();
        }
        this._tweenShuffle?.stop();
        const jumpHeight = 1.5;
        const jumpDuration = 0.3;
        const startPos = this.node.worldPosition.clone();
        const tweenJump = {x : 0};
        this._tweenShuffle = tween(tweenJump)
            .to(jumpDuration, { x: 1 }, { easing: easing.sineInOut,
                onUpdate: (target: any, ratio: number) =>
                {
                    Vec3.lerp(this._lerpPos, startPos, pos, target.x);
                    const heightOffset = Math.sin(target.x * Math.PI) * jumpHeight;
                    this._lerpPos.y += heightOffset;
                    this.node.setWorldPosition(this._lerpPos);
                }
            })            
            .start();
    }

    /**
     * Shuffle-to-cache movement driven by `dt` (call this inside `update(deltaTime)`).
     * - First call (or when target/index changes) will (re)start the motion.
     * - Subsequent calls will advance the motion until it reaches the target.
     */
    
    public shuffleToCacheUpdate(dt: number, pos: Vec3, index: number): void
    {
        if (this._tweenRetrieve && this._tweenRetrieve.running)
            return;

        const distanceToTarget = Vec3.distance(this.node.worldPosition, pos);
        if (distanceToTarget < 0.01)
        {
            this._shuffleUpdateActive = false;
            return;
        }

        const targetChanged = Vec3.squaredDistance(this._shuffleUpdateTargetPos, pos) > 0.0001;
        const indexChanged = this._shuffleUpdateIndex !== index;

        if (!this._shuffleUpdateActive || targetChanged || indexChanged)
        {
            if (this._tweenShuffle)
            {
                this._tweenShuffle.stop();
            }
            this._tweenShuffle?.stop();

            this._shuffleUpdateActive = true;
            this._shuffleUpdateProgress = 0;
            this._shuffleUpdateIndex = index;
            this.node.getWorldPosition(this._shuffleUpdateStartPos);
            this._shuffleUpdateTargetPos.set(pos);
        }

        if (!this._shuffleUpdateActive)
            return;

        const duration = Math.max(0.0001, this._shuffleUpdateDuration);
        this._shuffleUpdateProgress = Math.min(1, this._shuffleUpdateProgress + (dt / duration));

        const rawT = this._shuffleUpdateProgress;
        const easedT = easing.sineInOut(rawT);

        Vec3.lerp(this._lerpPos, this._shuffleUpdateStartPos, this._shuffleUpdateTargetPos, easedT);
        const heightOffset = Math.sin(rawT * Math.PI) * this._shuffleUpdateHeight;
        this._lerpPos.y += heightOffset;
        this.node.setWorldPosition(this._lerpPos);

        if (this._shuffleUpdateProgress >= 1)
        {
            this.node.setWorldPosition(this._shuffleUpdateTargetPos);
            this._shuffleUpdateActive = false;
        }
    }

    public setCacheSlotIndex(index: number): void
    {
        this._cacheSlotIndex = index;
    }

    public getLinkedWirePoint(): Node
    {
        return this.connections[ 0 ].node;
    }

    public changeState(stateName: EShooterState): void
    {
        this._stateMachine.changeState(stateName);
    }

    public tryCompleteShooter(): void
    {
        if (!this._firstChainShooter)
        {
            this.finishSelf();
            return;
        }

        let curShooter: IShooterItem = this._firstChainShooter;
        while (curShooter)
        {
            if (curShooter.getAmmoCount() > 0)
            {
                return;
            }
            curShooter = curShooter.getRightLinkedShooter();
        }
        curShooter = this._firstChainShooter;
        while (curShooter)
        {
            curShooter.finishSelf();
            curShooter = curShooter.getRightLinkedShooter();
        }
    }

    public canJumpToConveyor(count: number): boolean
    {
        if (!this._firstChainShooter)
        {
            return this.canJumpToConveyorSelf();
        }

        let shooter: IShooterItem = this._firstChainShooter;
        let c = 0;
        while (shooter)
        {
            c++;
            if (!shooter.canJumpToConveyorSelf())
            {
                return false;
            }
            shooter = shooter.getRightLinkedShooter();
        }
        if (c > count)
            return false;
        return true;

    }

    public getRightLinkedShooter(): IShooterItem | null
    {
        return this._rightLinkedShooter;
    }


    canJumpToConveyorSelf(): boolean
    {
        if (this._cacheSlotIndex >= 0)
        {
            if (this.isReadyToJump())
                return true;
            return false;
        }
        if (this.isAtTop() && this.isReadyToJump())
            return true;
        return false;
    }


    public isReadyToJump(): boolean
    {
        return this._stateMachine.currentState.name === EShooterState.Ready;
    }

    public shakeCharacter(duration: number, strength: number): void
    {
        const originalPosition = Vec3.ZERO
        this.characterRoot.setPosition(Vec3.ZERO);
        const tweenShake = tween(this.characterRoot)
            .to(duration, { position: new Vec3(
                originalPosition.x + (Math.random() * 2 - 1) * strength,
                originalPosition.y + (Math.random() * 2 - 1) * strength,
                originalPosition.z + (Math.random() * 2 - 1) * strength
            ) }, { easing: easing.sineInOut })
            .to(duration, { position: originalPosition }, { easing: easing.sineInOut })
            .start();
    }

    public finishSelf(): void
    {
        this.changeState(EShooterState.Finish);
        this.connectionRoot.active = false;
    }
}


