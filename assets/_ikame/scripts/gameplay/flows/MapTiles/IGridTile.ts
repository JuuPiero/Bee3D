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
    removePixelBlock(): IPixelBlock;
    isContainBlock(): boolean;
    getPixelBlock(): IPixelBlock;
    getOccupyingColorID(): number;

    setLinkedTiles(top : IGridTile, bottom: IGridTile, left: IGridTile, right: IGridTile): void
    getTopLinkedTile(): IGridTile
    getBottomLinkedTile(): IGridTile
    getLeftLinkedTile(): IGridTile
    getRightLinkedTile(): IGridTile

    isMatchingColorID(colorID: number): boolean;

    isEmpty(): boolean
    markEmpty(): void 
}


