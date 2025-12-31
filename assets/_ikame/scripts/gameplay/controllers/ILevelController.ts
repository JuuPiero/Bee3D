import { EDirection } from "../../enums/EDirection"
import { SplineSmooth } from "../../splines/SplineSmooth"
import { ICacheSlotController } from "../cacheSlots/ICacheSlotController"
import { PixelBlock } from "../flows/Block/PixelBlock"
import { IGridTile } from "../flows/MapTiles/IGridTile"
import { Node } from "cc"
import { IShooterItem } from "../flows/ShooterItem/IShooterItem"

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
    getFloaterToStream(): Node 
    returnFloaterToPool(floater: Node): void
    getRemainCount(): number 

    addToShooterMap(id: number, shooter: IShooterItem): void
}


