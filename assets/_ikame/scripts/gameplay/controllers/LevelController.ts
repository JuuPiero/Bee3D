import { _decorator, AudioClip, Camera, CCBoolean, CCFloat, CCInteger, Color, Component, director, Director, EventKeyboard, EventTouch, geometry, Input, input, instantiate, JsonAsset, KeyCode, MeshRenderer, Node, PhysicsSystem, Prefab, Quat, TextAsset, tween, Vec2, Vec3 } from 'cc';
import { LevelData } from '../../configData/LevelData';
import { EDITOR, PREVIEW } from 'cc/env';
import { PixelBlock } from '../flows/Block/PixelBlock';
import { Utils } from '../../utils/Utils';
import { EColor } from '../../enums/EColor';
import { EDirection } from '../../enums/EDirection';
import { GridTile } from '../flows/MapTiles/GridTile';
import { ILevelController } from './ILevelController';
import { IGridTile } from '../flows/MapTiles/IGridTile';
import { ColorQueueControllers } from '../queues/ColorQueueControllers';
import { SplineSmooth } from '../../splines/SplineSmooth';
import { Conveyor } from '../flows/Conveyor/Conveyor';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { ICacheSlotController } from '../cacheSlots/ICacheSlotController';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../designPatterns/observer/EventName';
import { IShooterItem } from '../flows/ShooterItem/IShooterItem';
import { BulletPooling } from '../../pooling/BulletPooling';
import { Floater } from '../flows/Floater/Floater';
import { ETrackingEvent, TrackingManager } from '../../base-script/PlayableAds/Tracking/TrackingManager';
import { LevelScaler } from '../LevelScaler';
import { IPixelBlock } from '../flows/Block/IPixelBlock';
import { Queue } from '../../commons/Queue';
import { lerpMultiplePoints, pathLength } from '../../utils/MathUtils';
const { ccclass, property } = _decorator;

const PIXEL_BLOCK_SIZE = 1;
const GRAVITY = 32.8;
@ccclass('LevelController')
export class LevelController extends Component implements ILevelController
{

    private _isFinished: boolean = false;

    @property({ type: Prefab, group: 'Pixel Map' })
    public pixelBlockPrefab: Prefab = null;
    @property({ type: Node, group: 'Pixel Map' })
    public pixelBlockHolder: Node = null;
    public levelData: LevelData = null;

    @property({ type: Node, group: 'MapBorder' })
    public topLeft: Node = null;
    @property({ type: Node, group: 'MapBorder' })
    public botRight: Node = null;

    public get maxX(): number { return this.botRight.position.x; }
    public get minX(): number { return this.topLeft.position.x; }
    public get maxZ(): number { return this.botRight.position.z; }
    public get minZ(): number { return this.topLeft.position.z; }

    private _centerMap: Vec3 = undefined;
    @property({ type: Camera })
    private cameraMain: Camera = null;

    @property({ type: CCBoolean, group: 'Debug' })
    public debugDrawMapBorder: boolean = false;

    @property({ type: [JsonAsset] , group: 'LevelData' })
    public levelJsonAssets: JsonAsset[] = [];

    @property({ type: CCInteger, group: 'LevelData' })
    public tutQueueIndex: number;

    @property(BulletPooling) public bulletPool: BulletPooling;
    @property(BulletPooling) public particlePooling: BulletPooling;

    @property(LevelScaler) public levelScaler: LevelScaler;

    @property(AudioClip) public breakBlockBreak: AudioClip;
    @property(AudioClip) public shootOutClip: AudioClip;

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


    private _pixelCount: number = 0;
    private _totalPixelCount: number = 0;

    private _shooterMapByID: Map<number, IShooterItem> = new Map<number, ShooterItem>();

    @property(AudioClip) private hitSound: AudioClip = null;

    private _is25Completed: boolean = false;
    private _is50Completed: boolean = false;
    private _is75Completed: boolean = false;

    private _bottomPixels: IPixelBlock[] = [];

    @property({ type: CCInteger, group: 'LevelData' })
    private levelIndex: number = 0;
    
    private  _topLeftBoundTile: GridTile;
    private  _botRightBoundTile: GridTile;

    protected _debugDrawSpline(): void
    {
        if (!this.cameraMain || !EDITOR || !PREVIEW || !this.debugDrawMapBorder) return;

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
        if ((EDITOR || PREVIEW) && this.debugDrawMapBorder)
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

        if (event.keyCode === KeyCode.KEY_R)
        {
            const outsideColors = this.getAllOutsideColor();
            console.log('Outside edge colors:', outsideColors);
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
        this.conveyor.init();
        //#region Spawn Pixel Blocks
        var textJson = JSON.stringify(this.levelJsonAssets[this.levelIndex].json);
        this.levelData = new LevelData(textJson);

        this.pixelBlockHolder.setPosition(this.CenterMap);
        const scaleHorizontal = this.WidthMap / this.levelData.widthMap;
        const scaleVertical = this.HeightMap / this.levelData.heightMap;
        const mapScale = Math.min(scaleHorizontal, scaleVertical);
        this.pixelBlockHolder.setScale(mapScale, mapScale, mapScale);
        
        const offsetX = (-this.levelData.widthMap / 2) +  (PIXEL_BLOCK_SIZE / 2);
        const offsetZ = (-this.levelData.heightMap / 2) + (PIXEL_BLOCK_SIZE / 2);
        const bottomRowIndex = this.levelData.heightMap - 1;
        this._bottomPixels.length = this.levelData.widthMap;
        for (let i = 0; i < this.levelData.widthMap; i++)
        {
            for (let j = 0; j < this.levelData.heightMap; j++)
            {
                const key = Utils.generateKeyFromCoord(i, j);
                const gridTile = new GridTile(i, j, this.pixelBlockHolder, new Vec3(i + offsetX, 0, j + offsetZ));
                this._gridMap.set(key, gridTile);
            }
        }

        this._topLeftBoundTile = new GridTile(-1, -1, this.pixelBlockHolder, new Vec3(-1 + offsetX, 0, -1 + offsetZ))
        this._botRightBoundTile = new GridTile(this.getLevelWidth(), this.getLevelHeight(), this.pixelBlockHolder, new Vec3(this.getLevelWidth() + offsetX, 0, this.getLevelHeight() + offsetZ));

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
            pixelNode.setParent(this.pixelBlockHolder)
            const pixelBlockComp = pixelNode.getComponent(PixelBlock);
            pixelBlockComp.init(pixelData.material , this, this.bulletPool, this.particlePooling);
            const key = Utils.generateKeyFromCoord(pixelData.x, pixelData.y);
            const gridTile = this._gridMap.get(key);
            pixelNode.setWorldPosition(gridTile.getWorldPos());
            gridTile.setPixelBlock(pixelBlockComp);
        }
        //#endregion

        this.colorQueueControllers.init(this.levelData.shooterQueues, this);
        this._pixelCount = this.levelData.pixels.length;
        this._totalPixelCount = this._pixelCount;

        this.linkShooters();


        this._is25Completed = false;
        this._is50Completed = false;
        this._is75Completed = false;

        if (PREVIEW || EDITOR)
        {
            this.logAllColorIDs();
            this.topLeft.setWorldPosition(this._topLeftBoundTile.getWorldPos());
            this.botRight.setWorldPosition(this._botRightBoundTile.getWorldPos());
        }
    }

    private logAllColorIDs(): void
    {
        const colorSet = new Set<number>();
        for (const [, tile] of this._gridMap)
        {
            if (tile.isContainBlock())
            {
                colorSet.add(tile.getOccupyingColorID());
            }
        }
        const colorList = Array.from(colorSet).sort((a, b) => a - b);
        const colorNames = colorList.map(id => `${EColor[id] ?? 'Unknown'}(${id})`);
        console.log(`[LevelController] Color IDs on map (${colorList.length}): [${colorNames.join(', ')}]`);
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
        this.pixelBlockHolder.destroyAllChildren();
        this.colorQueueControllers.clearQueue();
        this.conveyor.clearConveyor();
        this._gridMap.clear();
    }

    private onTouchStart(event: EventTouch): void
    {
        if (this._isFinished) return;

        event.getLocation(this._screenPos);
        const ray = this.cameraMain.screenPointToRay(this._screenPos.x, this._screenPos.y);
        const isHit = PhysicsSystem.instance.raycastClosest(ray);
        if (!isHit) return;
        const hitResult = PhysicsSystem.instance.raycastClosestResult;
        const shooter = hitResult.collider.node.getComponent(ShooterItem);
        if (!shooter) return;

        if (this.conveyor.getNextEmpty() === null)
        {
            shooter.shakeCharacter(0.13, 0.1);
            EventDispatcher.dispatch(EventName.PlaySFX, this.hitSound, 0.5);
            return;
        }

        const canAdd = shooter.onTouchShooter(this.conveyor.getRemaniningSlotCount())
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
        return null
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
        this._pixelCount--;
        this.trackLevelProgress();
        if (this._pixelCount <= 0)
        {
            this._isFinished = true;
            this.levelIndex++;
            this.scheduleOnce(() => {
                EventDispatcher.dispatch(EventName.EndGame, true, this.levelIndex >= this.levelJsonAssets.length);
            }, 0.5);
        }
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
        return this.getShooterCount() <= this.conveyor.floaters.length;
    }

    
    public getBestFloaterSlot(): Floater 
    {
        return this.conveyor.getNextEmpty();
    }

    public findPathOutOfMap(x: number, z: number): IGridTile[]
    {
        const startTile = this._gridMap.get(Utils.generateKeyFromCoord(x, z));
        if (!startTile) return null;

        const isEdgeTile = (tile: IGridTile): boolean =>
        {
            return !tile.getTopLinkedTile() || !tile.getBottomLinkedTile() || !tile.getLeftLinkedTile() || !tile.getRightLinkedTile();
        };

        const startKey = Utils.generateKeyFromCoord(x, z);
        const visited = new Set<string>([ startKey ]);
        const parent = new Map<string, IGridTile>();
        const queue: IGridTile[] = [ startTile ];

        while (queue.length > 0)
        {
            const current = queue.shift();
            if (isEdgeTile(current))
            {
                const path: IGridTile[] = [];
                let node: IGridTile | undefined = current;
                while (node)
                {
                    path.unshift(node);
                    node = parent.get(Utils.generateKeyFromCoord(node.getCoordX(), node.getCoordZ()));
                }
                return path;
            }

            const neighbors = [ current.getTopLinkedTile(), current.getBottomLinkedTile(), current.getLeftLinkedTile(), current.getRightLinkedTile() ];
            for (const neighbor of neighbors)
            {
                if (!neighbor || !neighbor.isEmpty()) continue;
                const key = Utils.generateKeyFromCoord(neighbor.getCoordX(), neighbor.getCoordZ());
                if (visited.has(key)) continue;
                visited.add(key);
                parent.set(key, current);
                queue.push(neighbor);
            }
        }

        return null;
    }

    public getAllOutsideColor(): number[]
    {
        const colors = new Set<number>();
        const width = this.getLevelWidth();
        const height = this.getLevelHeight();

        for (let z = 0; z < height; z++)
        {
            for (let x = 0; x < width; x++)
            {
                const tile = this.getTileAtCoord(x, z);
                if (!tile || !tile.isContainBlock()) continue;

                const colorID = tile.getOccupyingColorID();
                if (colors.has(colorID)) continue;

                const path = this.findPathOutOfMap(x, z);
                if (path)
                {
                    colors.add(colorID);
                }
            }
        }

        return Array.from(colors);
    }

    public doUpdate(dt: number): void
    {
        this.colorQueueControllers.doUpdate(dt);
    }

    public checkLose():  void
    {
        const inConveyColor: Set<number> = new Set<number>();
        for (const floater of this.conveyor.floaters)
        {
            const shooter = floater.getShooter();
            if (!shooter) return;
            if (shooter.getAmmoCount() <= 0) return;
            inConveyColor.add(shooter.getColorID());
        }
        const colorEgdes = this.getAllOutsideColor(); 
        const hasOverlap = colorEgdes.some(color => inConveyColor.has(color));
        if (!hasOverlap)
        {
            this.lose();
        }

    }

    public trackLevelProgress(): void
    {
        const progress = (this._totalPixelCount - this._pixelCount) / this._totalPixelCount * 100;
        if (!this._is25Completed && progress >= 25)
        {
            this._is25Completed = true;
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_25);
        }
        if (!this._is50Completed && progress >= 50)
        {
            this._is50Completed = true;
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_50);
        }
        if (!this._is75Completed && progress >= 75)
        {
            this._is75Completed = true;
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_75);
        }
    }

    public scaleLevel(): void
    {
        // this.levelScaler.scaleToFitScreen();
        // this.colorQueueControllers.node.setWorldPosition(this.levelScaler.lowerPoint.worldPosition);
    }

    public getResetProgress(): number
    {
        return this.conveyor.resetProgress;
    }

    public dropColumn(x: number): void
    {
        let i = 0;
        while (i < this.getLevelHeight())
        {
            const tile = this.getTileAtCoord(x, i);
            if (tile && tile.isContainBlock())
            {
                tile.getPixelBlock().moveBlockDown();
            }
            i++;
        }
    }

    setBottomPixel(block: IPixelBlock, colIndex: number, rowIndex: number): void {
        if (colIndex < 0 || colIndex >= this.getLevelWidth() || rowIndex < 0 || rowIndex !== this.getLevelHeight() - 1) {
            return;
        }
        this._bottomPixels[colIndex] = block;
    }    

    private _searchPixelWorldPos: Vec3 = new Vec3();

    private pushUniquePixel(out: IPixelBlock[], pixel: IPixelBlock | undefined): void
    {
        if (!pixel)
        {
            return;
        }

        const pixelUid = pixel.getUid();
        for (let i = 0; i < out.length; i++)
        {
            if (out[i].getUid() === pixelUid)
            {
                return;
            }
        }

        out.push(pixel);
    }

    public getSurroundingPixels(grid: IGridTile, pixel : IPixelBlock, out: IPixelBlock[]): void {
        
        const botTile = grid.getBottomLinkedTile();
        const topTile = grid.getTopLinkedTile();
        const leftTile = grid.getLeftLinkedTile();
        const rightTile = grid.getRightLinkedTile();
        out.length = 0;
        if (botTile && botTile.getPixelBlock())
            out.push(botTile.getPixelBlock())
        if (topTile && topTile.getPixelBlock())
            out.push(topTile.getPixelBlock())
        if (leftTile && leftTile.getPixelBlock())
            out.push(leftTile.getPixelBlock())
        if (rightTile && rightTile.getPixelBlock())
            out.push(rightTile.getPixelBlock())
    }
    
    public getTutorialPosition(): Vec3 {
        return this.colorQueueControllers.getQueueTopPosition(this.tutQueueIndex);
    }

    public findTargetPixels(colorID: number, out: Map<IPixelBlock, IGridTile[]>, max: number): void {
        out.clear();
        let y = this.getLevelHeight() - 1;
        let x = 0;
        while (y >= 0)
        {
            while (x < this.getLevelWidth())
            {
                const tile = this.getTileAtCoord(x, y);
                if (tile && tile.getPixelBlock() && tile.getPixelBlock().getColorID() === colorID && !tile.getPixelBlock().isTargeted())
                {
                    let path = this.findPathOutOfMap(tile.getCoordX(), tile.getCoordZ())
                    if (path)
                    {
                        // path.unshift(tile)
                        out.set(tile.getPixelBlock(), path);
                        tile.getPixelBlock().setTargeted(true);
                    }
                    if (out.size >= max)
                    {
                        y = -1
                        x = this.getLevelWidth() + 1;
                        break;
                    }
                }
                x++
            }
            x = 0;
            y--
            // for (const tile of row)
            // {
            //     tile.removePixelBlock();
            // }
        }
    }

    moveBulletByPathToTarget(block: IPixelBlock, path: IGridTile[], startPos: Vec3)
    {
        const exitTile = path[path.length - 1];
        const newWaypoints : Vec3[] = []
        if (exitTile.getCoordZ() === 0) // TOP
        {
            const waypoint = new Vec3(exitTile.getWorldPosX(),  exitTile.getWorldPos().y, this._topLeftBoundTile.getWorldPos().z)
            newWaypoints.push(waypoint);
            if (exitTile.getCoordX() < this.getLevelWidth() * 0.5)
            {
                newWaypoints.push(this._topLeftBoundTile.getWorldPos());
                newWaypoints.push(new Vec3(this._topLeftBoundTile.getWorldPosX(), exitTile.getWorldPos().y, this._botRightBoundTile.getWorldPosZ()))
            }
            else 
            {
                newWaypoints.push(new Vec3(this._botRightBoundTile.getWorldPos().x, exitTile.getWorldPos().y, this._topLeftBoundTile.getWorldPos().z))
                newWaypoints.push(this._botRightBoundTile.getWorldPos())
            }
        }
        else if (exitTile.getCoordZ() === this.getLevelHeight() - 1) // Bottom
        {
            const waypoint = new Vec3(exitTile.getWorldPosX(), exitTile.getWorldPos().y, this._botRightBoundTile.getWorldPos().z)
            newWaypoints.push(waypoint);
        }
        else if (exitTile.getCoordX() === 0) // LEFT
        {
            const waypoint = new Vec3(this._topLeftBoundTile.getWorldPos().x, exitTile.getWorldPos().y, exitTile.getWorldPosZ())
            newWaypoints.push(waypoint);
            newWaypoints.push(new Vec3(this._topLeftBoundTile.getWorldPosX(), exitTile.getWorldPos().y, this._botRightBoundTile.getWorldPosZ()));
        }
        else if (exitTile.getCoordX() === this.getLevelWidth() - 1) //RIGHT
        {
            const waypoint = new Vec3(this._botRightBoundTile.getWorldPos().x, exitTile.getWorldPos().y, exitTile.getWorldPosZ())
            newWaypoints.push(waypoint);
            newWaypoints.push(this._botRightBoundTile.getWorldPos());
        }
        
        const enterMapWaypoint = new Vec3(startPos.x, this._botRightBoundTile.getWorldPos().y, this._botRightBoundTile.getWorldPosZ())
        newWaypoints.push(enterMapWaypoint)
        newWaypoints.push(startPos)

        const definitiveWaypoints = (path.map(x => x.getWorldPos())).concat(newWaypoints);
        const bullet = this.bulletPool.getBullet();
        const translationPos = new Vec3();
        const progressObj = { x: 1 };
        const duration = pathLength(definitiveWaypoints) / 3;

        const meshRenderer = bullet.getComponentInChildren(MeshRenderer);
        meshRenderer.setInstancedAttribute('a_instColor', block.ColorBytes);
        meshRenderer.setInstancedAttribute('a_instColorShadow', block.ShadowBytes);

        // EventDispatcher.dispatch(EventName.PlaySFX, this.shootOutClip, 0.5)

        tween(progressObj).timeScale(director.getScheduler().getTimeScale()).to(duration, { x: 0 }, {
            onUpdate: () => {
                lerpMultiplePoints(translationPos, definitiveWaypoints, progressObj.x)
                bullet.setWorldPosition(translationPos);
            },
            onComplete: () => {
                block.markForDestroy(null)
                this.bulletPool.returnBullet(bullet);
                EventDispatcher.dispatch(EventName.PlaySFX, this.breakBlockBreak, 0.45)
            }
        }).start();
    }
}


