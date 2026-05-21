import { _decorator, Camera, CCBoolean, CCInteger, Node, Component, director, MeshRenderer, Vec3, tween, Scene, easing, ParticleSystem, game, Tween } from 'cc';
import { ColorConfig } from '../../../configData/ColorConfig';
import { EDITOR } from 'cc/env';
import { IPixelBlock } from './IPixelBlock';
import { IGridTile } from '../MapTiles/IGridTile';
import { ILevelController } from '../../controllers/ILevelController';
import { BulletPooling } from '../../../pooling/BulletPooling';
import { TweenShake } from '../../../commons/TweenShake';
const { ccclass, property } = _decorator;

const OUT_SCALE = new Vec3(1.1, 1.8, 1.1);

const BULLET_SPEED = 36;
const LOWER_SCALE = new Vec3(1, 0.5, 1);


const STRONG_SHAKE_STRENGTH = .34;
const WEAK_SHAKE_STRENGTH = .18;

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

    private _underTile: IGridTile = null;
    
    private _isTargeted: boolean = false;

    public isTargeted(): boolean {
        return this._isTargeted;
    }

    public setTargeted(targeted: boolean): void {
        this._isTargeted = targeted;
    }

    @property(TweenShake) public tweenShake: TweenShake = null;

    init(colorID: number, level: ILevelController, bulletPool: BulletPooling): void 
    {
        const color = this.colorData.getPixelBlockMaterialById(colorID);
        this.meshRenderer.setSharedMaterial( color, 0);
        this.colorID = colorID;
        this._level = level;
        this._bulletPool = bulletPool;   
    }

    getWorldPosition(out: Vec3): void 
    {
        this.node.getWorldPosition(out);
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
        this._level.setBottomPixel(this, this.coordX, this.coordZ);
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


        // this.node.active = false; // Hide the block immediately

        this.bulletNode = this._bulletPool.getBullet();
        const particles = this.bulletNode.getComponentsInChildren(ParticleSystem)
        particles.forEach(p =>
        {
            p.stop();
            p.clear();
            p.play();
        });

        this._level.removePixelFromColumn(this.coordX, this);
        this._gridTile.removePixelBlock();
        this._level.checkWinCondition();
    
        // this.bulletNode.setWorldPosition(barrolPosition);
        const targetPos = new Vec3();
        const startPos = new Vec3();
        const distance = Vec3.distance(barrolPosition, targetPos);
        const travelTime = (distance / BULLET_SPEED);
        this.bulletNode.setWorldPosition(barrolPosition);
        const bulletPos = new Vec3();
        startPos.set(barrolPosition);
        // const targetNode = this.node;
        tween(this.bulletNode)
            .to(travelTime, { worldPosition: targetPos }, {
                easing: easing.sineOut,
                onUpdate : (target, ratio) =>
                {
                    this.node.getWorldPosition(targetPos);
                    Vec3.lerp(bulletPos, startPos, targetPos, ratio);
                    this.bulletNode.setWorldPosition(bulletPos);
                },
                onComplete: () => {
                }
            })
            .start();
        
        const t = tween(this.cubeRoot)
            .delay (travelTime)
            .call(() => {
                this.particleNode.active = true;
                this.shakeEffect();
            })
            .to(0.12, { scale: OUT_SCALE }, { easing: easing.backOut })
            .to(0.1, { scale: LOWER_SCALE }, { easing: easing.quadIn })
            .to(0.1, { scale: Vec3.ZERO }, { easing: easing.smooth })
            .call(() =>
            {

                particles.forEach(p =>
                {
                    p.stop();
                    p.clear();
                });
                this._bulletPool.returnBullet(this.bulletNode);
                this._level.dropColumn(this.coordX);

                this.scheduleOnce(() =>
                {
                    this.node.destroy();
                }, 0.04);

            })
            .start();
        return true;
    }

    public isMarkedForDestroy(): boolean
    {
        return this._isMarkedForDestroy;
    }

    // private _gravityTween : Tween<Node> = null;
    // private _targetPosition: Vec3 = new Vec3();

    public moveBlockDown(): void
    {
        if (!this._underTile)
        {
            this._underTile = this._gridTile;
        }
        this._underTile = this._underTile.getBottomLinkedTile();

        if (!this._underTile) return;

        // if (this._gravityTween)        {
        //     this._gravityTween.stop();
        //     this._gravityTween = null;
        // }
        // const duration = Math.abs(this.node.worldPositionZ - this._underTile.getWorldPosZ()) / Z_SPEED;
        // this._targetPosition.set(this._underTile.getWorldPosX(), 0, this._underTile.getWorldPosZ());
        // this._gravityTween = tween(this.node)
        //     .to(duration, { worldPosition: this._targetPosition }, { easing: easing.linear })
        // this._gravityTween.start();
        this.coordZ = this._underTile.getCoordZ();
        this._level.setBottomPixel(this, this.coordX, this.coordZ);
    }

    public disable(): void
    {
        this.node.active = false;
    }
    
    private _surroundingPixels: IPixelBlock[] = [];

    public shakeEffect(): void 
    {
        this.shakeLite(STRONG_SHAKE_STRENGTH);
        this._surroundingPixels.length = 0;
        this._level.getSurroundingPixels(this._gridTile, this, this._surroundingPixels);
        for (const pixel of this._surroundingPixels) {
            pixel.shakeLite(WEAK_SHAKE_STRENGTH);
        }
    }

    public shakeLite(strength: number): void
    {
        this.tweenShake.playShake(0.15, strength);
    }
}


