import { _decorator, Camera, CCBoolean, CCInteger, Color, Component, director, MeshRenderer, Node, Vec3 } from 'cc';
import { ColorData } from '../../../configData/ColorData';
import { EDITOR } from 'cc/env';
import { IPixelBlock } from './IPixelBlock';
const { ccclass, property } = _decorator;

@ccclass('PixelBlock')
export class PixelBlock extends Component implements IPixelBlock
{
    @property({ type: CCInteger, readonly: true, group: 'Coordinates' })
    private x: number = 0;
    @property({ type: CCInteger, readonly: true, group: 'Coordinates' })
    private z: number = 0;

    @property({ type: ColorData , group: 'Color' })
    public colorData: ColorData = null;

    @property({ type: MeshRenderer, group: 'Renderer' })
    public meshRenderer: MeshRenderer = null;

    @property(CCInteger)
    public colorID: number = 0;

    @property({ type: CCBoolean, group: 'Debug' })
    public debugDraw: boolean = false;

    private _topLinkedBlock: IPixelBlock = null;
    private _bottomLinkedBlock: IPixelBlock = null;
    private _leftLinkedBlock: IPixelBlock = null;
    private _rightLinkedBlock: IPixelBlock = null;

    private _debugCamera: Camera = null;

    init(colorID: number, x: number, z: number): void 
    {
        const color = this.colorData.getColorById(colorID);
        this.meshRenderer.setSharedMaterial( color, 0);
        this.colorID = colorID;
        this.setCoord(x, z);
    }

    setCoord(x: number, z: number): void {
        this.x = x;
        this.z = z;
    }

    getCoord(): { x: number; z: number; } {
        return { x: this.x, z: this.z };
    }

    setLinkedBlock(top: IPixelBlock, bottom: IPixelBlock, left: IPixelBlock, right: IPixelBlock): void 
    {
        this._topLinkedBlock = top;
        this._bottomLinkedBlock = bottom;
        this._leftLinkedBlock = left;
        this._rightLinkedBlock = right;
    }

    getTopLinkedBlock(): IPixelBlock 
    {
        return this._topLinkedBlock;
    }

    getBottomLinkedBlock(): IPixelBlock
    {
        return this._bottomLinkedBlock;
    }

    getLeftLinkedBlock(): IPixelBlock
    {
        return this._leftLinkedBlock;
    }

    getRightLinkedBlock(): IPixelBlock
    {
        return this._rightLinkedBlock;
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
        if(EDITOR && this.debugDraw)
        {
            const worldPos = this.node.getWorldPosition();
            if (this._topLinkedBlock)
            {
                const topWorldPos = this._topLinkedBlock.getWorldPosition();
                this._debugCamera.camera.geometryRenderer?.addLine(worldPos, topWorldPos, Color.GREEN);
            }
            if (this._bottomLinkedBlock)
            {
                const bottomWorldPos = this._bottomLinkedBlock.getWorldPosition();
                this._debugCamera.camera.geometryRenderer?.addLine(worldPos, bottomWorldPos, Color.GREEN);
            }
            if (this._leftLinkedBlock)
            {
                const leftWorldPos = this._leftLinkedBlock.getWorldPosition();
                this._debugCamera.camera.geometryRenderer?.addLine(worldPos, leftWorldPos, Color.GREEN);
            }
            if (this._rightLinkedBlock)
            {
                const rightWorldPos = this._rightLinkedBlock.getWorldPosition();
                this._debugCamera.camera.geometryRenderer?.addLine(worldPos, rightWorldPos, Color.GREEN);
            }
        }
    }
}


