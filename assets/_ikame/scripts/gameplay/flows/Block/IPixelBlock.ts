import { Vec3 } from "cc";
import { IGridTile } from "../MapTiles/IGridTile";

export interface IPixelBlock {
    // init(id: number): void;
    getColorID(): number;
    getWorldPosition(out : Vec3): void;
    setTile(tile: IGridTile): void;
    getUid(): string;
    markForDestroy(barrolPosition: Vec3): boolean;
    isMarkedForDestroy(): boolean;
    moveBlockDown(): void;
    isTargeted(): boolean;
    setTargeted(targeted: boolean): void;
    disable(): void;
}

