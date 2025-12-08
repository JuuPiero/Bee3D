import { _decorator, Node, Vec3 } from 'cc';
import { IGridTile } from './IGridTile';
import { IPixelBlock } from '../Block/IPixelBlock';


export class GridTile implements IGridTile
{
    private _coordX: number;
    private _coordZ: number;

    private _worldPos: Vec3 = null;
    private _localPos: Vec3 = null;

    private _pixelBlock: IPixelBlock = null;

    private _topLinkedTile: IGridTile = null;
    private _bottomLinkedTile: IGridTile = null;
    private _leftLinkedTile: IGridTile = null;
    private _rightLinkedTile: IGridTile = null;

    constructor(public xCoord: number, public zCoord: number, parent: Node, localPos: Vec3)
    {
        this._coordX = xCoord;
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

    getCoordZ(): number
    {
        return this._coordZ;
    }

    getWorldPosX(): number
    {
        return this._worldPos.x;
    }

    getWorldPosZ(): number
    {
        return this._worldPos.z;
    }

    getLocalPos(): Vec3
    {
        return this._localPos;
    }
    
    getWorldPos(): Vec3
    {
        return this._worldPos;
    }

    setPixelBlock(pixelBlock: IPixelBlock): void
    {
        this._pixelBlock = pixelBlock;
        this._pixelBlock.setTile(this);
    }

    getPixelBlock(): IPixelBlock
    {
        return this._pixelBlock;
    }

    setLinkedTiles(top : IGridTile, bottom: IGridTile, left: IGridTile, right: IGridTile): void
    {
        this._topLinkedTile = top;
        this._bottomLinkedTile = bottom;
        this._leftLinkedTile = left;
        this._rightLinkedTile = right;
    }

    getTopLinkedTile(): IGridTile
    {
        return this._topLinkedTile;
    }

    getBottomLinkedTile(): IGridTile
    {
        return this._bottomLinkedTile;
    }

    getLeftLinkedTile(): IGridTile
    {
        return this._leftLinkedTile;
    }

    getRightLinkedTile(): IGridTile
    {
        return this._rightLinkedTile;
    }

    isContainBlock(): boolean
    {
        if (!this._pixelBlock) return false;
        if (this._pixelBlock.isMarkedForDestroy()) return false;
        return true;
    }

    getOccupyingColorID(): number
    {
        if (!this._pixelBlock) return -1;
        return this._pixelBlock.getColorID();
    }

    removePixelBlock(): void
    {
        this._pixelBlock = null;
    }

    isMatchingColorID(colorID: number): boolean
    {
        if (!this.isContainBlock()) return false;
        return this._pixelBlock.getColorID() === colorID;
    }
}


