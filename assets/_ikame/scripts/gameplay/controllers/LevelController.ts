import { _decorator, AudioClip, Camera, CCBoolean, CCFloat, Color, Component, EventKeyboard, EventTouch, Input, input, instantiate, JsonAsset, KeyCode, Node, PhysicsSystem, Prefab, Quat, TextAsset, tween, Vec2, Vec3 } from 'cc';
import { LevelData } from '../../configData/LevelData';
import { EDITOR } from 'cc/env';
import { PixelBlock } from '../flows/Block/PixelBlock';
import { Utils } from '../../utils/Utils';
import { EDirection } from '../../enums/EDirection';
import { GridTile } from '../flows/MapTiles/GridTile';
import { ILevelController } from './ILevelController';
import { IGridTile } from '../flows/MapTiles/IGridTile';
import { ColorQueueControllers } from '../queues/ColorQueueControllers';
import { SplineSmooth } from '../../splines/SplineSmooth';
import { Conveyor } from '../flows/Conveyor/Conveyor';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { CacheSlotController } from '../cacheSlots/CacheSlotController';
import { ICacheSlotController } from '../cacheSlots/ICacheSlotController';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../designPatterns/observer/EventName';
import { FloaterPool } from '../flows/Floater/FloaterPool';
import { IShooterItem } from '../flows/ShooterItem/IShooterItem';
import { BulletPooling } from '../../pooling/BulletPooling';
const { ccclass, property } = _decorator;

@ccclass('LevelController')
export class LevelController extends Component implements ILevelController
{    

    private _isFinished: boolean = false;

    @property({ type: Prefab, group: 'Pixel Map' })
    public pixelBlockPrefab: Prefab = null;
    @property({ type: Node, group: 'Pixel Map' })
    public pixelBlockHolder: Node = null;
    public levelData: LevelData = null;

    @property({ type: CCFloat, group: 'MapBorder' })
    public maxX: number = 1;
    @property({ type: CCFloat, group: 'MapBorder' })
    public minX: number = -1;
    @property({ type: CCFloat, group: 'MapBorder' })
    public maxZ: number = 1;
    @property({ type: CCFloat, group: 'MapBorder' })
    public minZ: number = -1;

    private _centerMap: Vec3 = undefined;
    @property({ type: Camera })
    private cameraMain: Camera = null;

    @property({ type: CCBoolean, group: 'Debug' })
    public debugDrawMapBorder: boolean = false;

    @property({ type: JsonAsset , group: 'LevelData' })
    public levelJsonAsset: JsonAsset

    @property(BulletPooling) public bulletPool: BulletPooling;

    private _shooterCount : number = 0;

    public get WidthMap(): number
    {
        return this.maxX - this.minX;
    }

    public get HeightMap(): number
    {
        return this.maxZ - this.minZ;
    }

    private _gridMap = new Map<string, GridTile>();
    
    public get CenterMap(): Vec3
    {
        if (!this._centerMap)
        {
            this._centerMap = new Vec3(
                (this.minX + this.maxX) * 0.5,
                0,
                (this.minZ + this.maxZ) * 0.5
            );
        }
        return this._centerMap;
    }
    
    private _debugTopLeftMap: Vec3 = new Vec3();
    private _debugTopRightMap: Vec3 = new Vec3();
    private _debugBottomLeftMap: Vec3 = new Vec3();
    private _debugBottomRightMap: Vec3 = new Vec3();

    @property({ type: ColorQueueControllers, group: 'Controllers' })
    protected colorQueueControllers: ColorQueueControllers = null;

    @property({ type: Conveyor, group: 'Controllers' })
    protected conveyor: Conveyor = null;

    @property({ type: CacheSlotController, group: 'Controllers' })
    protected cacheSlotController: CacheSlotController = null;

    @property({ type: FloaterPool, group: 'Controllers' })
    protected floaterPool: FloaterPool = null;

    private _totalPixelsCount: number = 0;

    private _shooterMapByID: Map<number, IShooterItem> = new Map<number, ShooterItem>();

    @property(AudioClip) private hitSound: AudioClip = null;

    private

    protected _debugDrawSpline(): void
    {
        if (!this.cameraMain || !EDITOR || !this.debugDrawMapBorder) return;

        this._debugTopLeftMap.set(this.minX, 0, this.minZ);
        this._debugTopRightMap.set(this.maxX, 0, this.minZ);
        this._debugBottomLeftMap.set(this.minX, 0, this.maxZ);
        this._debugBottomRightMap.set(this.maxX, 0, this.maxZ);

        this.cameraMain.camera.geometryRenderer?.addLine(this._debugTopLeftMap, this._debugTopRightMap, Color.MAGENTA);
        this.cameraMain.camera.geometryRenderer?.addLine(this._debugTopRightMap, this._debugBottomRightMap, Color.MAGENTA);
        this.cameraMain.camera.geometryRenderer?.addLine(this._debugBottomRightMap, this._debugBottomLeftMap, Color.MAGENTA);
        this.cameraMain.camera.geometryRenderer?.addLine(this._debugBottomLeftMap, this._debugTopLeftMap, Color.MAGENTA);
        
        this.cameraMain.camera.geometryRenderer?.addCircle(this.CenterMap, 0.1, Color.MAGENTA);
    }

    protected start(): void
    {
        if (EDITOR && this.debugDrawMapBorder)
        {
            if (!this.cameraMain.camera.geometryRenderer)
                this.cameraMain.camera.initGeometryRenderer();
        }

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: EventKeyboard): void 
    {
        if (event.keyCode === KeyCode.KEY_Q)
        {
            // this.levelData.verifyData();

            let blockRemain = 0;
            for (const [ key, tile ] of this._gridMap)
            {
                const pixelBlock = tile.getPixelBlock();
                if (pixelBlock)
                {
                    blockRemain++;
                }
            }

            let bulletCount = 0;
            for (const [ id, shooter ] of this._shooterMapByID)
            {
                if (shooter)
                    bulletCount += shooter.getAmmoCount();
            }

            console.log(`Level Verification:
            Total Blocks on Map: ${blockRemain}
            Total Bullets in Shooters: ${bulletCount}
            `);
        }
    }

    protected onDestroy(): void
    {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    public spawnLevel(): void 
    {
        this._isFinished = false;

        //#region Spawn Pixel Blocks
        var textJson = JSON.stringify(this.levelJsonAsset.json);
        this.levelData = new LevelData(textJson);
        
        this.pixelBlockHolder.setPosition(this.CenterMap);
        const scaleHorizontal = this.WidthMap / this.levelData.widthMap;
        const scaleVertical = this.HeightMap / this.levelData.heightMap;
        const mapScale = Math.min(scaleHorizontal, scaleVertical);
        this.pixelBlockHolder.setScale(mapScale, mapScale, mapScale);
        
        const offsetX = -this.levelData.widthMap / 2 + 0.5;
        const offsetZ = -this.levelData.heightMap / 2 + 0.5;
        
        for (let i = 0; i < this.levelData.widthMap; i++)
        {
            for (let j = 0; j < this.levelData.heightMap; j++)
            {
                const key = Utils.generateKeyFromCoord(i, j);
                const gridTile = new GridTile(i, j, this.pixelBlockHolder, new Vec3(i + offsetX, 0, j + offsetZ));
                this._gridMap.set(key, gridTile);
            }
        }

        for (const [ key, tile ] of this._gridMap)
        {
            const x = tile.getCoordX();
            const z = tile.getCoordZ();
            const topTile = this._gridMap.get( Utils.generateKeyFromCoord(x, z - 1) ) || null;
            const bottomTile = this._gridMap.get( Utils.generateKeyFromCoord(x, z + 1) ) || null;
            const leftTile = this._gridMap.get( Utils.generateKeyFromCoord(x - 1, z) ) || null;
            const rightTile = this._gridMap.get( Utils.generateKeyFromCoord(x + 1, z) ) || null;
            tile.setLinkedTiles(topTile, bottomTile,  leftTile, rightTile);
        }

        for (let i = 0; i < this.levelData.pixels.length; i++)
        {
            const pixelData = this.levelData.pixels[i];
            const pixelNode = instantiate(this.pixelBlockPrefab);
            pixelNode.parent = this.pixelBlockHolder;
            pixelNode.setPosition(pixelData.x + offsetX, 0, pixelData.y + offsetZ);
            const pixelBlockComp = pixelNode.getComponent(PixelBlock);
            pixelBlockComp.init(pixelData.material , this, this.bulletPool);
            const key = Utils.generateKeyFromCoord(pixelData.x, pixelData.y);
            const gridTile = this._gridMap.get(key);
            gridTile.setPixelBlock(pixelBlockComp);
        }
        //#endregion

        this.colorQueueControllers.init(this.levelData.shooterQueues, this);
        this.cacheSlotController.init(this.levelData.slotCount);
        this._totalPixelsCount = this.levelData.pixels.length;
        this.floaterPool.init(this.levelData.conveyorCapacity);

        ShooterItem.JumpToConveyorQueue.clear();
        this.linkShooters();
    }

    protected lateUpdate(dt: number): void
    {
        this._debugDrawSpline();
    }   

    public getShooterEdge(x: number, z: number): EDirection
    {
        if (x <= this.maxX && x >= this.minX)
        {
            if (z <= this.minZ ) return EDirection.TOP;
            if (z >= this.maxZ ) return EDirection.BOTTOM;
        }
        if (z <= this.maxZ && z >= this.minZ)
        {
            if (x <= this.minX ) return EDirection.LEFT;
            if (x >= this.maxX ) return EDirection.RIGHT;
        }
        return EDirection.NONE;
    }

    public getTileAtCoord(x: number, z: number): IGridTile | null
    {
        const key = Utils.generateKeyFromCoord(x, z);
        return this._gridMap.get(key) || null;
    }

    public getBlockAtCoord(x: number, z: number): PixelBlock | null
    {
        const key = Utils.generateKeyFromCoord(x, z);
        return this._gridMap.get(key).getPixelBlock() as PixelBlock;
    }

    public getLevelWidth(): number
    {
        return this.levelData.widthMap;
    }

    public getLevelHeight(): number
    {
        return this.levelData.heightMap;
    }

    public getSpline(): SplineSmooth
    {
        return this.conveyor;
    }

    private _screenPos = new Vec2();

    public clearLevel(): void
    {

    }

    private onTouchStart(event: EventTouch): void
    {
        if (this._isFinished || !this.floaterPool.isCanGetFloater()) return;

        event.getLocation(this._screenPos);
        const ray = this.cameraMain.screenPointToRay(this._screenPos.x, this._screenPos.y);
        const isHit = PhysicsSystem.instance.raycastClosest(ray);
        if (!isHit) return;
        const hitResult = PhysicsSystem.instance.raycastClosestResult;
        const shooter = hitResult.collider.node.getComponent(ShooterItem);
        if (!shooter) return;
        const canAdd = shooter.onTouchShooter(this.floaterPool.getAvailableCount());

        if (canAdd)
        {
            if (this.isFinalStepSureWin())
            {
                EventDispatcher.dispatch(EventName.SureWinFinalStep);
            }
        }
        else
        {
            shooter.shakeCharacter(0.13, 0.1);
            EventDispatcher.dispatch(EventName.PlaySFX, this.hitSound, 0.5);
        }

    }

    public getCacheSlotController(): ICacheSlotController
    {
        return this.cacheSlotController;
    }

    lose(): void
    {
        if (this._isFinished) return;
        this._isFinished = true;
        EventDispatcher.dispatch(EventName.EndGame, false);
    }

    checkWinCondition(): void 
    {
        if (this._isFinished) return;
        this._totalPixelsCount--;
        if (this._totalPixelsCount <= 0)
        {
            this._isFinished = true;
            this.scheduleOnce(() => {
                EventDispatcher.dispatch(EventName.EndGame, true, true);
            }, 0.5);
        }
    }

    public getFloaterToStream(): Node 
    {
        const floater = this.floaterPool.getFloaterOut();
        if (!floater) return null;

        const pos = new Vec3();
        const rot = new Quat();

        const startPos = new Vec3();
        const startRot = new Quat();
        floater.getWorldPosition(startPos);
        floater.getWorldRotation(startRot);
        
        const targetPos = new Vec3();
        const targetRot = new Quat();

        this.conveyor.getPercentageTransform(0, targetPos, targetRot);
        
        const tweenObj = { progress: 0 }
        const jumpHeight = 2;

        tween (tweenObj)
            .to(0.35, { progress: 1 }, {
                onUpdate: (target: any, ratio: number) =>   
                {
                    Vec3.lerp(pos, startPos, targetPos, target.progress);
            
                    // add some jump height
                    pos.y += Math.sin(target.progress * Math.PI) * jumpHeight;

                    Quat.slerp(rot, startRot, targetRot, target.progress);
                    floater.setWorldPosition(pos);
                    floater.setWorldRotation(rot);
                }
            })
            .start();


        return floater;
    }

    public returnFloaterToPool(floater: Node): void
    {
        this.floaterPool.returnFloater(floater);
    }

    public getRemainCount(): number 
    {
        return this.colorQueueControllers.getRemainInQueueCount();
    }

    public addToShooterMap(id: number, shooter: IShooterItem): void
    {
        this._shooterMapByID.set(id, shooter);
    }

    public linkShooters(): void 
    {
        if (this.levelData.connectedShooters.length <= 0) return;
        const firstChainShooter = this._shooterMapByID.get(this.levelData.connectedShooters[0].Shooters[0]);
        for (const linkedData of this.levelData.connectedShooters)
        {
            for (let i = 0; i < linkedData.Shooters.length; i++)
            {
                const mainShooter = this._shooterMapByID.get(linkedData.Shooters[i]);
                const firstShooter = this._shooterMapByID.get(linkedData.Shooters[i - 1]);
                const secondShooter = this._shooterMapByID.get(linkedData.Shooters[i + 1]);
                mainShooter.setLinkedShooters(firstShooter, secondShooter, firstChainShooter);
            }
        }
    }

    public addShooterCount(): void
    {
        this._shooterCount += 1;
    }

    public removeShooterCount(): void
    {
        this._shooterCount -= 1;
    }

    public getShooterCount(): number
    {
        return this._shooterCount;
    }

    public isFinalStepSureWin(): boolean
    {
        return this.getShooterCount() <= this.levelData.conveyorCapacity;
    }
}


