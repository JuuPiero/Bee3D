import { _decorator, Camera, CCBoolean, CCInteger, Node, Component, director, MeshRenderer, Vec3, tween, Scene, easing, ParticleSystem, game, Tween } from 'cc';
import { ColorConfig } from '../../../configData/ColorConfig';
import { EDITOR } from 'cc/env';
import { IPixelBlock } from './IPixelBlock';
import { IGridTile } from '../MapTiles/IGridTile';
import { ILevelController } from '../../controllers/ILevelController';
import { BulletPooling } from '../../../pooling/BulletPooling';
const { ccclass, property } = _decorator;

const OUT_SCALE = new Vec3(1.1, 3, 1.1);

const BULLET_SPEED = 9.8;
const LOWER_SCALE = new Vec3(1, 0.5, 1);

const Z_SPEED = 2.0;

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

    private _bulletPool: BulletPooling;

    private bulletNode: Node = null;

    @property(Node) public particleNode: Node = null;
    @property(Node) public cubeRoot: Node = null;

    private _underTile : IGridTile = null;

    init(colorID: number, level: ILevelController, bulletPool: BulletPooling): void 
    {
        const color = this.colorData.getPixelBlockMaterialById(colorID);
        this.meshRenderer.setSharedMaterial( color, 0);
        this.colorID = colorID;
        this._level = level;
        this._bulletPool = bulletPool;   
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

    public markForDestroy(barrolPosition: Vec3): boolean
    {
        if (this._isMarkedForDestroy) {
            return false;
        }
        this._isMarkedForDestroy = true;
        this._gridTile.removePixelBlock();
        this._level.checkWinCondition();

        // this.node.active = false; // Hide the block immediately

        this.bulletNode = this._bulletPool.getBullet();
        const particles = this.bulletNode.getComponentsInChildren(ParticleSystem)
        particles.forEach(p =>
        {
            p.stop();
            p.clear();
            p.play();
        });
    
        this.bulletNode.setWorldPosition(barrolPosition);
        const targetPos = this.node.getWorldPosition();
        targetPos.y = barrolPosition.y;

        const distance = barrolPosition.subtract(targetPos).length();
        const travelTime = (distance / BULLET_SPEED);

        tween(this.bulletNode)
            .to(travelTime, { worldPosition: targetPos})
            .call(() => {
                this.bulletNode.active = false;
                // this.node.active = false;
            })
        .start();
        tween(this.cubeRoot)
           .delay(travelTime - (travelTime * 0.3))
            .call(() => {
                this.particleNode.active = true;
            })
            .to(0.12, { scale: OUT_SCALE }, { easing: easing.backOut })
            .to(0.1, { scale: LOWER_SCALE }, { easing: easing.quadIn })
            .call(() => {
                this._level.dropColumn(this.coordX);
            })
            .to(0.1, { scale: Vec3.ZERO }, { easing: easing.smooth })
            .call(() =>
            {
                particles.forEach(p =>
                {
                    p.stop();
                    p.clear();
                });
                this._bulletPool.returnBullet(this.bulletNode);
            })
            .start();
        return true;
    }

    public isMarkedForDestroy(): boolean
    {
        return this._isMarkedForDestroy;
    }

    private _gravityTween : Tween<Node> = null;
    private _targetPosition: Vec3 = new Vec3();

    public moveBlockDown(): void
    {
        if (!this._underTile)
        {
            this._underTile = this._gridTile;
        }
        this._underTile = this._underTile.getBottomLinkedTile();

        if (!this._underTile) return;

        const duration = Math.abs(this.node.worldPositionZ - this._underTile.getWorldPosZ()) / Z_SPEED;
        if (this._gravityTween)        {
            this._gravityTween.stop();
        }
        this._targetPosition.set(this._underTile.getWorldPosX(), 0, this._underTile.getWorldPosZ());
        this._gravityTween = tween(this.node)
            .to(duration, { worldPosition: this._targetPosition }, { easing: easing.sineOut })
        this._gravityTween.start();
        this.coordZ = this._underTile.getCoordZ();
    }
}


