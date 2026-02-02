import { Vec3 , Node} from "cc";
import { EShooterState } from "./states/EShooterState";

export interface IShooterItem {
    changeAnimation(animationName: string, force: boolean): void;
    isAtTop(): boolean;
    jumpToConveyor(): Promise<void>;
    tryShootTargets(): number;
    moveAlongConveyor(dt: number): void;
    faceTheMapDirection(): void;
    setCacheSlot(slotIndex: number, isJump: boolean): void;
    retrieveToCacheSlot(): Promise<void>;
    reduceAmmoCount(amount: number): number;
    getAmmoCount(): number;
    finishAnimation(): void;
    shootSoundEffect(): void;
    clearPassedBlocks(): void;

    shuffleToCache(pos: Vec3, index: number): void
    setCacheSlotIndex(index: number): void

    getLinkedWirePoint(): Node

    changeState(stateName: EShooterState): void
    tryCompleteShooter(): void

    isReadyToJump(): boolean

    setLinkedShooters(shooterLeft: IShooterItem, shooterRight: IShooterItem, firstChainShooter: IShooterItem): void
    
    canJumpToConveyorSelf(): boolean

    getRightLinkedShooter(): IShooterItem | null

    finishSelf(): void 

    shuffleToCacheUpdate(dt: number, pos: Vec3, index: number): void

    markPassedBlocks(): void

    getColorID(): number
}


