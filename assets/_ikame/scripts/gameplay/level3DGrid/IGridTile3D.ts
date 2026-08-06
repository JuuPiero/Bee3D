import { Node, Vec3 } from 'cc';
import { PixelBlock } from '../flows/Block/PixelBlock';

export interface IGridTile3D {
    getCoordX(): number;
    getCoordY(): number;
    getCoordZ(): number;

    getLocalPos(): Vec3;
    getWorldPos(): Vec3;

    setBlock(blockNode: Node, block: PixelBlock | null): void;
    getBlockNode(): Node;
    getBlock(): PixelBlock | null;
    removeBlock(): Node;
    isContainBlock(): boolean;
    isEmpty(): boolean;

    /** Cube data lives on the tile because the block component is not initialized yet. */
    setCubeData(colorID: number, health: number): void;
    getColorID(): number;
    getHealth(): number;
    isMatchingColorID(colorID: number): boolean;

    setLinkedTiles(
        up: IGridTile3D,
        down: IGridTile3D,
        top: IGridTile3D,
        bottom: IGridTile3D,
        left: IGridTile3D,
        right: IGridTile3D
    ): void;
    /** +Y */
    getUpLinkedTile(): IGridTile3D;
    /** -Y */
    getDownLinkedTile(): IGridTile3D;
    /** -Z */
    getTopLinkedTile(): IGridTile3D;
    /** +Z */
    getBottomLinkedTile(): IGridTile3D;
    /** -X */
    getLeftLinkedTile(): IGridTile3D;
    /** +X */
    getRightLinkedTile(): IGridTile3D;
}
