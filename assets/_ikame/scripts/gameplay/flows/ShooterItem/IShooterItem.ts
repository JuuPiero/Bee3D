import { Vec3 , Node} from "cc";
import { EShooterState } from "./states/EShooterState";
import { IPixelBlock } from "../Block/IPixelBlock";
import { IGridTile } from "../MapTiles/IGridTile";
import { IGridTile3D } from "../../level3DGrid/IGridTile3D";

export interface IShooterItem {
    doNoTarget(): void;
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
    findTargets(): Map<IPixelBlock, IGridTile[]>
    rotateTowardsTargetAsync( deltaAngle: number): Promise<void>
    shootTarget(target: IPixelBlock): boolean
    moveByPathToTarget (block: IPixelBlock, path : IGridTile[]): void
    getTargets(): Map<IPixelBlock, IGridTile[]>
    pauseAnimation(): void
    getAngleDeltaToTarget(target: IPixelBlock): number
    destroyShooter(): void

    /** Picks (and remembers) the next cube of this shooter's color, or null when there is none. */
    findTargetTile(): IGridTile3D | null
    /** The cube findTargetTile() last picked, still unshot. */
    getTargetTile(): IGridTile3D | null
    /** Fires one bullet at the remembered cube; clears it either way. */
    shootTargetTile(): boolean
    getAngleDeltaToTile(tile: IGridTile3D): number
}


