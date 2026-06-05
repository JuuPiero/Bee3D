import { _decorator, AudioClip, Camera, CCBoolean, CCFloat, CCInteger, Color, Component, EventKeyboard, EventTouch, Input, input, instantiate, JsonAsset, KeyCode, Node, PhysicsSystem, Prefab, Quat, TextAsset, tween, Vec2, Vec3 } from 'cc';
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

    public get maxX(): number { return this.botRight.worldPosition.x; }
    public get minX(): number { return this.topLeft.worldPosition.x; }
    public get maxZ(): number { return this.botRight.worldPosition.z; }
    public get minZ(): number { return this.topLeft.worldPosition.z; }

    private _centerMap: Vec3 = undefined;
    @property({ type: Camera })
    private cameraMain: Camera = null;

    @property({ type: CCBoolean, group: 'Debug' })
    public debugDrawMapBorder: boolean = false;

    @property({ type: [JsonAsset] , group: 'LevelData' })
    public levelJsonAssets: JsonAsset[] = [];

    @property(BulletPooling) public bulletPool: BulletPooling;

    @property(LevelScaler) public levelScaler: LevelScaler;

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
    private _pixelColumn: Queue<IPixelBlock>[] = [];
    private _columnHolders: Node[] = [];
    private _columnFallSpeeds: number[] = [];
    private _columnBaseZ: number = 0;
    
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
    private levelIndex : number = 0;

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
        this._pixelColumn.length = 0;
        this._columnHolders.length = 0;
        this._columnFallSpeeds.length = 0;
        
        this.pixelBlockHolder.setPosition(this.CenterMap);
        const scaleHorizontal = this.WidthMap / this.levelData.widthMap;
        const scaleVertical = this.HeightMap / this.levelData.heightMap;
        const mapScale = Math.min(scaleHorizontal, scaleVertical);
        this.pixelBlockHolder.setScale(mapScale, mapScale, mapScale);
        
        const offsetX = (-this.levelData.widthMap / 2) +  (PIXEL_BLOCK_SIZE / 2);
        const offsetZ = (-this.levelData.heightMap / 2) + (PIXEL_BLOCK_SIZE / 2);
        const bottomRowIndex = this.levelData.heightMap - 1;
        this._columnBaseZ = bottomRowIndex + offsetZ;
        this._bottomPixels.length = this.levelData.widthMap;
        for (let i = 0; i < this.levelData.widthMap; i++)
        {
            const columnHolder = new Node(`ColumnHolder_${i}`);
            columnHolder.parent = this.pixelBlockHolder;
            columnHolder.setPosition(i + offsetX, 0, this._columnBaseZ);
            this._columnHolders[i] = columnHolder;
            this._columnFallSpeeds[i] = 0;

            for (let j = 0; j < this.levelData.heightMap; j++)
            {
                const key = Utils.generateKeyFromCoord(i, j);
                const gridTile = new GridTile(i, j, this.pixelBlockHolder, new Vec3(i + offsetX, 0, j + offsetZ));
                this._gridMap.set(key, gridTile);
            }
            this._pixelColumn.push(new Queue<IPixelBlock>());
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
            pixelNode.parent = this._columnHolders[pixelData.x];
            pixelNode.setPosition(0, 0, pixelData.y - bottomRowIndex);
            const pixelBlockComp = pixelNode.getComponent(PixelBlock);
            pixelBlockComp.init(pixelData.material , this, this.bulletPool);
            const key = Utils.generateKeyFromCoord(pixelData.x, pixelData.y);
            const gridTile = this._gridMap.get(key);
            gridTile.setPixelBlock(pixelBlockComp);

            this._pixelColumn[pixelData.x].enqueue(pixelBlockComp);
        }
        //#endregion

        this.colorQueueControllers.init(this.levelData.shooterQueues, this);
        this._pixelCount = this.levelData.pixels.length;
        this._totalPixelCount = this._pixelCount;

        this.linkShooters();


        this._is25Completed = false;
        this._is50Completed = false;
        this._is75Completed = false;

        if(PREVIEW || EDITOR)
            this.logAllColorIDs();
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

    public getAllOutsideColor(): number[]
    {
        const colors = new Set<number>();
        const width = this.getLevelWidth();
        const height = this.getLevelHeight();

        // From BOTTOM edge (z = height - 1), scan upward
        for (let x = 0; x < width; x++)
        {
            let tile: IGridTile | null = this.getTileAtCoord(x, height - 1);
            while (tile && !tile.isContainBlock())
            {
                tile = tile.getTopLinkedTile();
            }
            if (tile && tile.isContainBlock())
            {
                colors.add(tile.getOccupyingColorID());
            }
        }

        return Array.from(colors);
    }

    public doUpdate(dt: number): void
    {
        this.updateGravity(dt);
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
        this.levelScaler.scaleToFitScreen();
        this.colorQueueControllers.node.setWorldPosition(this.levelScaler.lowerPoint.worldPosition);
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

    findTargetPixel(colorID: number, rowSign: number, startColIndex: number): { isRowChanged: boolean; pixelBlock: IPixelBlock; nextColIndex: number } {

        const isFlipped = rowSign % 2 !== 0;
        const width = this.getLevelWidth();
        let colIndex = startColIndex;
        const step = isFlipped ? -1 : 1;
        while (colIndex >= 0 && colIndex < width) {
            const pixel = this.getBottomPixelAt(colIndex);
            if (pixel && pixel.getColorID() === colorID && !pixel.isTargeted()) {
                pixel.setTargeted(true);
                const isRowChanged = (isFlipped ? colIndex === 0 : colIndex === width - 1) || !this.hasSameColorTilEndRow(colorID, colIndex, step, width);
                const nextColIndex = isRowChanged ? colIndex : colIndex + step;
                return { isRowChanged: isRowChanged, pixelBlock: pixel, nextColIndex: nextColIndex };
            }
            colIndex += step;
        }
        const isRowChanged = (isFlipped ? colIndex === 0 : colIndex === width - 1) || !this.hasSameColorTilEndRow(colorID, colIndex, step, width);
        return { isRowChanged: isRowChanged, pixelBlock: undefined, nextColIndex : colIndex}
    }
    

    private hasSameColorTilEndRow(colorID: number, colIndex: number, step: number, width)
    {
        let col: number = colIndex + step;
        while (col >= 0 && col < width)
        {
            const pixel = this.getBottomPixelAt(col)
            if (!pixel)
            {
                col += step;
                continue;
            }
            if (pixel.getColorID() === colorID && !pixel.isTargeted())
                return true;
            col += step;
        }
        return false;
    }


    setBottomPixel(block: IPixelBlock, colIndex: number, rowIndex: number): void {
        if (colIndex < 0 || colIndex >= this.getLevelWidth() || rowIndex < 0 || rowIndex !== this.getLevelHeight() - 1) {
            return;
        }
        this._bottomPixels[colIndex] = block;
    }    


    public getBottomPixelAt(col : number): IPixelBlock
    {
        if (!this._pixelColumn[col]) console.log ("HHHHH", col)
        return this._pixelColumn[col].peek();
    }

    public removePixelFromColumn(colIndex: number, pixel: IPixelBlock): void
    {
        const column = this._pixelColumn[colIndex];
        if (column.peek() === pixel)
        {
            column.dequeue();
        }
    }

    private _colIndex : number = 0;

    public updateGravity(dt: number): void {
        for (this._colIndex = 0; this._colIndex < this.getLevelWidth(); this._colIndex++)
        {
            const columnHolder = this._columnHolders[this._colIndex];

            const emptySlotCount = this.getLevelHeight() - columnHolder.children.length;
            const targetZ = this._columnBaseZ + emptySlotCount;
            const currentPosition = columnHolder.position;
            const deltaZ = targetZ - currentPosition.z;

            if (deltaZ <= 0)
            {
                this._columnFallSpeeds[this._colIndex] = 0;
                if (deltaZ < 0)
                {
                    columnHolder.setPosition(currentPosition.x, currentPosition.y, targetZ);
                }
                continue;
            }

            this._columnFallSpeeds[this._colIndex] += GRAVITY * dt;
            const fallDistance = Math.min(deltaZ, this._columnFallSpeeds[this._colIndex] * dt);
            const nextZ = currentPosition.z + fallDistance;
            columnHolder.setPosition(currentPosition.x, currentPosition.y, nextZ);

            if (nextZ >= targetZ)
            {
                this._columnFallSpeeds[this._colIndex] = 0;
            }
        }
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

    private collectNearestPixelsInColumn(column: Queue<IPixelBlock> | undefined, targetWorldZ: number, out: IPixelBlock[]): void
    {
        if (!column || column.isEmpty())
        {
            return;
        }

        let nearestPixel: IPixelBlock = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        let abovePixel: IPixelBlock = null;
        let aboveDistance = Number.POSITIVE_INFINITY;
        let belowPixel: IPixelBlock = null;
        let belowDistance = Number.POSITIVE_INFINITY;

        for (const pixel of column.Items)
        {
            if (!pixel )
            {
                continue;
            }

            pixel.getWorldPosition(this._searchPixelWorldPos);
            const pixelWorldZ = this._searchPixelWorldPos.z;
            const distanceToTarget = Math.abs(pixelWorldZ - targetWorldZ);
            if (distanceToTarget < nearestDistance)
            {
                nearestDistance = distanceToTarget;
                nearestPixel = pixel;
            }

            if (pixelWorldZ < targetWorldZ)
            {
                const distanceAbove = targetWorldZ - pixelWorldZ;
                if (distanceAbove < aboveDistance)
                {
                    aboveDistance = distanceAbove;
                    abovePixel = pixel;
                }
            }
            else if (pixelWorldZ > targetWorldZ)
            {
                const distanceBelow = pixelWorldZ - targetWorldZ;
                if (distanceBelow < belowDistance)
                {
                    belowDistance = distanceBelow;
                    belowPixel = pixel;
                }
            }
        }

        if (!nearestPixel)
        {
            return;
        }

        nearestPixel.getWorldPosition(this._searchPixelWorldPos);
        const nearestWorldZ = this._searchPixelWorldPos.z;

        let topNeighbor: IPixelBlock = null;
        let topNeighborDistance = Number.POSITIVE_INFINITY;
        let bottomNeighbor: IPixelBlock = null;
        let bottomNeighborDistance = Number.POSITIVE_INFINITY;

        for (const pixel of column.Items)
        {
            if (!pixel || pixel === nearestPixel)
            {
                continue;
            }

            pixel.getWorldPosition(this._searchPixelWorldPos);
            const pixelWorldZ = this._searchPixelWorldPos.z;

            if (pixelWorldZ < nearestWorldZ)
            {
                const distance = nearestWorldZ - pixelWorldZ;
                if (distance < topNeighborDistance)
                {
                    topNeighborDistance = distance;
                    topNeighbor = pixel;
                }
            }
            else if (pixelWorldZ > nearestWorldZ)
            {
                const distance = pixelWorldZ - nearestWorldZ;
                if (distance < bottomNeighborDistance)
                {
                    bottomNeighborDistance = distance;
                    bottomNeighbor = pixel;
                }
            }
        }

        this.pushUniquePixel(out, nearestPixel);
        this.pushUniquePixel(out, topNeighbor || abovePixel);
        this.pushUniquePixel(out, bottomNeighbor || belowPixel);
    }

    private _tempPixelPos : Vec3 = new Vec3();

    public getSurroundingPixels(grid: IGridTile, pixel : IPixelBlock, out: IPixelBlock[]): void {
        
        const botTile = grid.getBottomLinkedTile();
        const topTile = grid.getTopLinkedTile();
        if (botTile && botTile.isContainBlock())
        {
            out.push(botTile.getPixelBlock());
        }
        if (topTile && topTile.isContainBlock())
        {
            out.push(topTile.getPixelBlock());
        }
        const curX = grid.getCoordX();
        const leftCol = this._pixelColumn[curX - 1];
        const rightCol = this._pixelColumn[curX + 1];
        pixel.getWorldPosition(this._tempPixelPos);
        const targetWorldZ = this._tempPixelPos.z;

        if (leftCol)
        {
            this.collectNearestPixelsInColumn(leftCol, targetWorldZ, out);
        }

        if (rightCol)
        {
            this.collectNearestPixelsInColumn(rightCol, targetWorldZ, out);
        }
    }
}


