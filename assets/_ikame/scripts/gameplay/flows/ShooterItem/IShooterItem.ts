export interface IShooterItem {
    changeAnimation(animationName: string, force: boolean): void;
    isAtTop(): boolean;
    jumpToConveyor(): Promise<void>;
    tryShootTargets(): boolean;
    moveAlongConveyor(dt: number): void;
    faceTheMapDirection(): void;
    setCacheSlot(slotIndex: number, isJump: boolean): void;
    retrieveToCacheSlot(): Promise<void>;
    reduceAmmoCount(): number;
    getAmmoCount(): number;
    finishAnimation(): void;
    shootSoundEffect(): void;
}


