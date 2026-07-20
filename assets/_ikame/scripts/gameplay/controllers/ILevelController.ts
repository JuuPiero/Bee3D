import { EDirection } from "../../enums/EDirection"
import { SplineSmooth } from "../../splines/SplineSmooth"
import { ICacheSlotController } from "../cacheSlots/ICacheSlotController"
import { PixelBlock } from "../flows/Block/PixelBlock"
import { IGridTile } from "../flows/MapTiles/IGridTile"
import { Node, Vec3 } from "cc"
import { IShooterItem } from "../flows/ShooterItem/IShooterItem"
import { Floater } from "../flows/Floater/Floater"
import { IPixelBlock } from "../flows/Block/IPixelBlock"
import { GridTile } from "../flows/MapTiles/GridTile"

export interface ILevelController
{
    clearLevel(): void
    spawnLevel(): void
    getShooterEdge(x: number, z: number): EDirection
    getTileAtCoord(x: number, z: number): IGridTile | null
    getBlockAtCoord(x: number, z: number): PixelBlock | null
    getLevelWidth(): number
    getLevelHeight(): number
    getSpline(): SplineSmooth
    getCacheSlotController(): ICacheSlotController
    lose(): void 
    checkWinCondition(): void 

    getRemainCount(): number 
    addToShooterMap(id: number, shooter: IShooterItem): void
    addShooterCount(): void
    removeShooterCount(): void
    getShooterCount(): number
    isFinalStepSureWin(): boolean

    getBestFloaterSlot(): Floater 

    doUpdate(dt: number): void
    checkLose(): void

    trackLevelProgress(): void

    scaleLevel(): void

    getResetProgress(): number
    dropColumn(x: number): void
    
    setBottomPixel(block: IPixelBlock, colIndex: number, rowIndex: number): void
    
    getSurroundingPixels(grid : IGridTile , pixel : IPixelBlock, out: IPixelBlock[]): void

    getTutorialPosition(): Vec3;

    findTargetPixels(colorID: number, out: Map<IPixelBlock, IGridTile[]>, max: number): void
    
    moveBulletByPathToTarget(block: IPixelBlock, path: IGridTile[], startPos: Vec3)

}


