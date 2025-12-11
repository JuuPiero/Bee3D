import { _decorator, Camera, CCBoolean, CCInteger, Node, Component, director, MeshRenderer, Vec3, tween, Scene, easing } from 'cc';
import { ColorConfig } from '../../../configData/ColorConfig';
import { EDITOR } from 'cc/env';
import { IPixelBlock } from './IPixelBlock';
import { IGridTile } from '../MapTiles/IGridTile';
import { ILevelController } from '../../controllers/ILevelController';
const { ccclass, property } = _decorator;

const BULLET_SCALE = 0.03;

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

    private _level: ILevelController = null;

    @property(Node) bulletNode : Node = null;
    @property(Node) public particleNode: Node = null;
    @property(Node) public cubeRoot: Node = null;

    init(colorID: number, level: ILevelController): void 
    {
        const color = this.colorData.getPixelBlockMaterialById(colorID);
        this.meshRenderer.setSharedMaterial( color, 0);
        this.colorID = colorID;
        this._level = level;
    
        this.bulletNode.active = false;
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

    public markForDestroy(barrolPosition: Vec3): void
    {
        if (this._isMarkedForDestroy) return;
        this._isMarkedForDestroy = true;
        this._gridTile.removePixelBlock();
        this._level.checkWinCondition();

        // const scene = director.getScene();
        // this.bulletNode.setParent(scene);
        this.bulletNode.active = true;
        this.bulletNode.setWorldPosition(barrolPosition);
        this.bulletNode.setWorldScale(BULLET_SCALE, BULLET_SCALE, BULLET_SCALE);
        const targetPos = this.node.getWorldPosition();
        targetPos.y = barrolPosition.y;
        tween(this.bulletNode)
            .to(0.1, { worldPosition: targetPos})
            .call(() => {
                this.bulletNode.active = false;
                // this.node.active = false;
            })
            .start();
        tween(this.cubeRoot)
            .delay(0.05)
            .call(() => {
                this.particleNode.active = true;
            })
            .to(0.12, { scale: new Vec3(1, 3.5, 1) }, { easing: easing.backOut })
            .to(0.1, { scale: new Vec3(1, 0, 1) }, { easing: easing.smooth })
            .call(() => {
                this.node.active = false;
            })
            .start();
    }

    public isMarkedForDestroy(): boolean
    {
        return this._isMarkedForDestroy;
    }
}


