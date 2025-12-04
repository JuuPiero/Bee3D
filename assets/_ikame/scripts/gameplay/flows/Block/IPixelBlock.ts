import { Vec3 } from "cc";

export interface IPixelBlock {
    init(id: number, x: number, z: number): void;
    getCoord(): { x: number; z: number; };
    setCoord(x: number, z: number): void;
    setLinkedBlock(top: IPixelBlock, bottom: IPixelBlock, left: IPixelBlock, right: IPixelBlock): void;
    getTopLinkedBlock(): IPixelBlock;
    getBottomLinkedBlock(): IPixelBlock;
    getLeftLinkedBlock(): IPixelBlock;
    getRightLinkedBlock(): IPixelBlock;
    getWorldPosition(): Vec3;
    getColorID(): number;
}

