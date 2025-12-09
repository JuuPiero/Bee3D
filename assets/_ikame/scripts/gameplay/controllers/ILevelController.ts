import { EDirection } from "../../enums/EDirection"
import { SplineSmooth } from "../../splines/SplineSmooth"
import { ICacheSlotController } from "../cacheSlots/ICacheSlotController"
import { PixelBlock } from "../flows/Block/PixelBlock"
import { IGridTile } from "../flows/MapTiles/IGridTile"

export interface ILevelController
{
    spawnLevel(): void
    getShooterEdge(x: number, z: number): EDirection
    getTileAtCoord(x: number, z: number): IGridTile | null
    getBlockAtCoord(x: number, z: number): PixelBlock | null
    getLevelWidth(): number
    getLevelHeight(): number
    getSpline(): SplineSmooth
    getCacheSlotController(): ICacheSlotController
}


