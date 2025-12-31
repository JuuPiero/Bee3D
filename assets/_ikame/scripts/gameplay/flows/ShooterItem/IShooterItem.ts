import { Vec3 , Node} from "cc";

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

    shuffleToCache(pos: Vec3): void
    setCacheSlotIndex(index: number): void

    setLinkedShooter(shooters: IShooterItem)
    getLinkedWirePoint(): Node
}


