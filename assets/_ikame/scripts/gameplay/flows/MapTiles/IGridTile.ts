import { Vec3 } from "cc";
import { IPixelBlock } from "../Block/IPixelBlock";

export interface IGridTile {
    getCoordX(): number;
    getCoordZ(): number;

    getWorldPosX(): number;
    getWorldPosZ(): number;

    getLocalPos(): Vec3;
    getWorldPos(): Vec3;

    setPixelBlock(pixelBlock: IPixelBlock): void;
    isOccupied(): boolean;
    getPixelBlock(): IPixelBlock;
    getOccupyingColorID(): number;

    setLinkedTiles(top : IGridTile, bottom: IGridTile, left: IGridTile, right: IGridTile): void
    getTopLinkedTile(): IGridTile
    getBottomLinkedTile(): IGridTile
    getLeftLinkedTile(): IGridTile
    getRightLinkedTile(): IGridTile

}


