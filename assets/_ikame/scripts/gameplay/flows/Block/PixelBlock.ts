import { _decorator, Camera, CCBoolean, CCInteger, Node, Component, director, MeshRenderer, Vec3, tween, Scene, easing, ParticleSystem, game, Tween, BoxCollider, Vec2 } from 'cc';
import { ColorConfig } from '../../../configData/ColorConfig';
import { EDITOR, PREVIEW } from 'cc/env';
import { IPixelBlock } from './IPixelBlock';
import { IGridTile } from '../MapTiles/IGridTile';
import { ILevelController } from '../../controllers/ILevelController';
import { BulletPooling } from '../../../pooling/BulletPooling';
import { TweenShake } from '../../../commons/TweenShake';
import { ParticlePlayer } from './ParticlePlayer';
import { DEBUG_PATH } from 'cc/userland/macro';
const { ccclass, property } = _decorator;

const OUT_SCALE = new Vec3(1.1, 2.8, 1.1);

const BULLET_SPEED = 16;
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

    // private bulletNode: Node = null;

    @property(Node) public particleNode: Node = null;
    @property(Node) public cubeRoot: Node = null;

    private _underTile: IGridTile = null;
    
    private _isTargeted: boolean = false;
    private _particlePool: BulletPooling = null;

    @property(Node) public particleRoot: Node 

    public isTargeted(): boolean {
        return this._isTargeted;
    }

    public setTargeted(targeted: boolean): void {
        this._isTargeted = targeted;
    }

    @property(TweenShake) public tweenShake: TweenShake = null;

    private _colorBytes: Uint8Array;
    private _shadowBytes: Uint8Array;

    public get ColorBytes(): Uint8Array
    {
        return this._colorBytes;
    }

    public get ShadowBytes(): Uint8Array
    {
        return this._shadowBytes;
    }

    init(colorID: number, level: ILevelController, bulletPool: BulletPooling, particlePool: BulletPooling): void 
    {
        const blockColors = this.colorData.getBlockColors(colorID);
        if (blockColors) {
            const colorBytes = new Uint8Array([blockColors.color.r, blockColors.color.g, blockColors.color.b, blockColors.color.a]);
            const shadowBytes = new Uint8Array([blockColors.shadow.r, blockColors.shadow.g, blockColors.shadow.b, blockColors.shadow.a]);
            this.meshRenderer.setInstancedAttribute('a_instColor', colorBytes);
            this.meshRenderer.setInstancedAttribute('a_instColorShadow', shadowBytes);
            
            this._colorBytes = colorBytes;
            this._shadowBytes = shadowBytes;
        }
        this.colorID = colorID;
        this._level = level;
        this._bulletPool = bulletPool;
        this._particlePool = particlePool;
    }

    getWorldPosition(out: Vec3): void 
    {
        this.node.getWorldPosition(out);
    }

    protected start(): void
    {
        if( (EDITOR ||PREVIEW) && this.debugDraw)
        {
            this._debugCamera = director.getScene().getChildByName('Main Camera').getComponent(Camera);
            if (!this._debugCamera.camera.geometryRenderer)
            {
                this._debugCamera.camera.initGeometryRenderer();
            }

            if (DEBUG_PATH) {
                const colDebug = this.node.addComponent(BoxCollider)
                colDebug.size = new Vec3(1, 2.3, 1)
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

        this._gridTile.removePixelBlock();
        this._level.checkWinCondition();

        this.particleNode = this._particlePool.getBullet(); 
        this.particleNode.active = false;

        const vfxPlayer = this.particleNode.getComponent(ParticlePlayer)
        
        vfxPlayer.play();
        this.particleNode.setWorldPosition(this.particleRoot.worldPosition);
        this.particleNode.active = true;
        this.shakeEffect();
        tween(this.cubeRoot)
            .to(0.12, { scale: OUT_SCALE }, { easing: easing.backOut })
            .to(0.1, { scale: LOWER_SCALE }, { easing: easing.quadIn })
            .to(0.1, { scale: Vec3.ZERO }, { easing: easing.smooth })
            .call(() =>
            {
                this.scheduleOnce(() =>
                {
                    this._particlePool.returnBullet(this.particleNode);
                    this.node.destroy();
                }, .04);

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


