import { _decorator, Camera, CCBoolean, CCInteger, Color, Component, director, MeshRenderer, Vec3 } from 'cc';
import { ColorConfig } from '../../../configData/ColorConfig';
import { EDITOR } from 'cc/env';
import { IPixelBlock } from './IPixelBlock';
import { IGridTile } from '../MapTiles/IGridTile';
const { ccclass, property } = _decorator;

@ccclass('PixelBlock')
export class PixelBlock extends Component implements IPixelBlock
{
    @property({ type: ColorConfig , group: 'Color' })
    public colorData: ColorConfig = null;

    @property({ type: MeshRenderer, group: 'Renderer' })
    public meshRenderer: MeshRenderer = null;

    @property(CCInteger)
    public colorID: number = 0;

    @property({ type: CCBoolean, group: 'Debug' })
    public debugDraw: boolean = false;

    @property({ type: CCInteger, group: 'Debug' })
    public coordX: number = 0;

    @property({ type: CCInteger, group: 'Debug' })
    public coordZ: number = 0;

    private _debugCamera: Camera = null;

    private _gridTile: IGridTile = null;

    private _isMarkedForDestroy: boolean = false;

    init(colorID: number): void 
    {
        const color = this.colorData.getPixelBlockMaterialById(colorID);
        this.meshRenderer.setSharedMaterial( color, 0);
        this.colorID = colorID;
    }


    getWorldPosition(): Vec3
    {
        return this.node.getWorldPosition();
    }

    protected start(): void
    {
        if(EDITOR && this.debugDraw)
        {
            this._debugCamera = director.getScene().getChildByName('Main Camera').getComponent(Camera);
            if (!this._debugCamera.camera.geometryRenderer)
            {
                this._debugCamera.camera.initGeometryRenderer();
            }
        }
    }

    getColorID(): number
    {
        return this.colorID;
    }

    protected lateUpdate(dt: number): void
    {
        // if(EDITOR && this.debugDraw)
        // {
        //     const worldPos = this.node.getWorldPosition();
        //     if (this._topLinkedBlock)
        //     {
        //         const topWorldPos = this._topLinkedBlock.getWorldPosition();
        //         this._debugCamera.camera.geometryRenderer?.addLine(worldPos, topWorldPos, Color.GREEN);
        //     }
        //     if (this._bottomLinkedBlock)
        //     {
        //         const bottomWorldPos = this._bottomLinkedBlock.getWorldPosition();
        //         this._debugCamera.camera.geometryRenderer?.addLine(worldPos, bottomWorldPos, Color.GREEN);
        //     }
        //     if (this._leftLinkedBlock)
        //     {
        //         const leftWorldPos = this._leftLinkedBlock.getWorldPosition();
        //         this._debugCamera.camera.geometryRenderer?.addLine(worldPos, leftWorldPos, Color.GREEN);
        //     }
        //     if (this._rightLinkedBlock)
        //     {
        //         const rightWorldPos = this._rightLinkedBlock.getWorldPosition();
        //         this._debugCamera.camera.geometryRenderer?.addLine(worldPos, rightWorldPos, Color.GREEN);
        //     }
        // }
    }

    setTile(tile: IGridTile): void
    {
        this._gridTile = tile;
        this.coordX = tile.getCoordX();
        this.coordZ = tile.getCoordZ();
    }

    getUid(): string
    {
        return this.node.uuid;
    }

    public markForDestroy(): void
    {
        if (this._isMarkedForDestroy) return;
        this._isMarkedForDestroy = true;
        this.node.active = false;
    }
}


