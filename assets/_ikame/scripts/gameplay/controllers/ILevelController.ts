import { EDirection } from "../../enums/EDirection"
import { SplineSmooth } from "../../splines/SplineSmooth"
import { ICacheSlotController } from "../cacheSlots/ICacheSlotController"
import { PixelBlock } from "../flows/Block/PixelBlock"
import { IGridTile } from "../flows/MapTiles/IGridTile"
import { Node } from "cc"
import { IShooterItem } from "../flows/ShooterItem/IShooterItem"
import { Floater } from "../flows/Floater/Floater"
import { IPixelBlock } from "../flows/Block/IPixelBlock"

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

    findTargetPixels(max: number, colorID: number, out: IPixelBlock[],  rowSign: number): boolean
    
    setBottomPixel(block: IPixelBlock, colIndex: number, rowIndex: number): void
    
    removePixelFromColumn(colIndex: number, pixel: IPixelBlock): void

    getSurroundingPixels(grid : IGridTile , pixel : IPixelBlock, out: IPixelBlock[]): void
}


