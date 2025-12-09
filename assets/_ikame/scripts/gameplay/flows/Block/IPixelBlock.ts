import { Vec3 } from "cc";
import { IGridTile } from "../MapTiles/IGridTile";

export interface IPixelBlock {
    // init(id: number): void;
    getColorID(): number;
    setTile(tile: IGridTile): void;
    getUid(): string;
    markForDestroy(): void;
    isMarkedForDestroy(): boolean;
}

