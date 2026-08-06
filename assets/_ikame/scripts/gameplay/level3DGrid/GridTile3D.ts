import { Node, Vec3 } from 'cc';
import { IGridTile3D } from './IGridTile3D';
import { PixelBlock } from '../flows/Block/PixelBlock';

export class GridTile3D implements IGridTile3D
{
    private _coordX: number;
    private _coordY: number;
    private _coordZ: number;

    private _worldPos: Vec3 = null;
    private _localPos: Vec3 = null;

    private _blockNode: Node = null;
    private _block: PixelBlock = null;

    private _colorID: number = -1;
    private _health: number = 0;

    private _upLinkedTile: IGridTile3D = null;
    private _downLinkedTile: IGridTile3D = null;
    private _topLinkedTile: IGridTile3D = null;
    private _bottomLinkedTile: IGridTile3D = null;
    private _leftLinkedTile: IGridTile3D = null;
    private _rightLinkedTile: IGridTile3D = null;

    constructor(public xCoord: number, public yCoord: number, public zCoord: number, parent: Node, localPos: Vec3)
    {
        this._coordX = xCoord;
        this._coordY = yCoord;
        this._coordZ = zCoord;
        this._localPos = localPos;
        //#region Calculate world position
        this._worldPos = new Vec3();
        const m = parent.getWorldMatrix();
        Vec3.transformMat4(this._worldPos, this._localPos, m);
        //#endregion
    }

    getCoordX(): number
    {
        return this._coordX;
    }

    getCoordY(): number
    {
        return this._coordY;
    }

    getCoordZ(): number
    {
        return this._coordZ;
    }

    getLocalPos(): Vec3
    {
        return this._localPos;
    }

    getWorldPos(): Vec3
    {
        return this._worldPos;
    }

    /**
     * Stores the block reference only. Unlike GridTile.setPixelBlock, this does not call
     * back into the block: PixelBlock.setTile needs the level reference that init() assigns,
     * and the spawn flow does not call init() yet.
     */
    setBlock(blockNode: Node, block: PixelBlock | null): void
    {
        this._blockNode = blockNode;
        this._block = block;
    }

    getBlockNode(): Node
    {
        return this._blockNode;
    }

    getBlock(): PixelBlock | null
    {
        return this._block;
    }

    removeBlock(): Node
    {
        const res = this._blockNode;
        this._blockNode = null;
        this._block = null;
        return res;
    }

    isContainBlock(): boolean
    {
        if (!this._blockNode || !this._blockNode.isValid) return false;
        if (this._block && this._block.isMarkedForDestroy()) return false;
        return true;
    }

    isEmpty(): boolean
    {
        return !this.isContainBlock();
    }

    setCubeData(colorID: number, health: number): void
    {
        this._colorID = colorID;
        this._health = health;
    }

    getColorID(): number
    {
        if (!this.isContainBlock()) return -1;
        return this._colorID;
    }

    getHealth(): number
    {
        return this._health;
    }

    isMatchingColorID(colorID: number): boolean
    {
        if (!this.isContainBlock()) return false;
        return this._colorID === colorID;
    }

    setLinkedTiles(
        up: IGridTile3D,
        down: IGridTile3D,
        top: IGridTile3D,
        bottom: IGridTile3D,
        left: IGridTile3D,
        right: IGridTile3D
    ): void
    {
        this._upLinkedTile = up;
        this._downLinkedTile = down;
        this._topLinkedTile = top;
        this._bottomLinkedTile = bottom;
        this._leftLinkedTile = left;
        this._rightLinkedTile = right;
    }

    getUpLinkedTile(): IGridTile3D
    {
        return this._upLinkedTile;
    }

    getDownLinkedTile(): IGridTile3D
    {
        return this._downLinkedTile;
    }

    getTopLinkedTile(): IGridTile3D
    {
        return this._topLinkedTile;
    }

    getBottomLinkedTile(): IGridTile3D
    {
        return this._bottomLinkedTile;
    }

    getLeftLinkedTile(): IGridTile3D
    {
        return this._leftLinkedTile;
    }

    getRightLinkedTile(): IGridTile3D
    {
        return this._rightLinkedTile;
    }
}
