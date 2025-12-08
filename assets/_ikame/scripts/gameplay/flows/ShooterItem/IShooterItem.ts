export interface IShooterItem {
    changeAnimation(animationName: string, force: boolean): void;
    isAtTop(): boolean;
    jumpToConveyor(): Promise<void>;
    tryShootTargets(): boolean;
    moveAlongConveyor(dt: number): void;
    faceTheMapDirection(): void;
}


