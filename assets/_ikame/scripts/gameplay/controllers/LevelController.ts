import { _decorator, Camera, CCBoolean, CCFloat, Color, Component, instantiate, Node, Prefab, Vec3 } from 'cc';
import { LevelData } from '../../configData/LevelData';
import { EDITOR } from 'cc/env';
import { PixelBlock } from '../flows/Block/PixelBlock';
import { Utils } from '../../utils/Utils';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { EDirection } from '../../enums/EDirection';
const { ccclass, property } = _decorator;

@ccclass('LevelController')
export class LevelController extends Component 
{    
    @property({ type: Prefab, group: 'Pixel Map' })
    public pixelBlockPrefab: Prefab = null;
    @property({ type: Node, group: 'Pixel Map' })
    public pixelBlockHolder: Node = null;
    @property({ type: LevelData, group: 'Pixel Map' })
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

    public get WidthMap(): number
    {
        return this.maxX - this.minX;
    }

    public get HeightMap(): number
    {
        return this.maxZ - this.minZ;
    }

    private _blockMapByCoord = new Map<string, PixelBlock>();
    

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


        this.spawnLevel();
    }

    protected onDestroy(): void
    {
    }

    public spawnLevel(): void 
    {
        //#region Spawn Pixel Blocks

        const offsetX = -this.levelData.widthMap / 2 + 0.5;
        const offsetZ = -this.levelData.heightMap / 2 + 0.5;

        for (let i = 0; i < this.levelData.pixels.length; i++)
        {
            const pixelData = this.levelData.pixels[i];
            const pixelNode = instantiate(this.pixelBlockPrefab);
            pixelNode.parent = this.pixelBlockHolder;
            pixelNode.setPosition(pixelData.x + offsetX, 0, pixelData.z + offsetZ);
            const pixelBlockComp = pixelNode.getComponent(PixelBlock);
            pixelBlockComp.init(pixelData.id, pixelData.x, pixelData.z);
            const key = Utils.generateKeyFromCoord(pixelData.x, pixelData.z);
            this._blockMapByCoord.set(key, pixelBlockComp);
        }
        for (let [ key, pixelBlock ] of this._blockMapByCoord)
        {
            const ogCoord = pixelBlock.getCoord();
            const topBlock = this._blockMapByCoord.get( Utils.generateKeyFromCoord(ogCoord.x, ogCoord.z - 1) ) || null;
            const bottomBlock = this._blockMapByCoord.get( Utils.generateKeyFromCoord(ogCoord.x, ogCoord.z + 1) ) || null;
            const leftBlock = this._blockMapByCoord.get( Utils.generateKeyFromCoord(ogCoord.x - 1, ogCoord.z) ) || null;
            const rightBlock = this._blockMapByCoord.get( Utils.generateKeyFromCoord(ogCoord.x + 1, ogCoord.z) ) || null;
            pixelBlock.setLinkedBlock(topBlock, bottomBlock, leftBlock, rightBlock);
        }
        this.pixelBlockHolder.setPosition(this.CenterMap);
        const scaleHorizontal = this.WidthMap / this.levelData.widthMap;
        const scaleVertical = this.HeightMap / this.levelData.heightMap;
        const mapScale = Math.min(scaleHorizontal, scaleVertical);
        this.pixelBlockHolder.setScale(mapScale, mapScale, mapScale);
        //#endregion
    }

    protected lateUpdate(dt: number): void
    {
        this._debugDrawSpline();
    }   

    public getShooterEdge(x: number, z: number): EDirection
    {
        if (x <= this.minX) return EDirection.LEFT;
        if (x >= this.maxX) return EDirection.RIGHT;
        if (z <= this.minZ) return EDirection.TOP;
        return EDirection.BOTTOM;
    }

    public getBlockAtCoord(x: number, z: number): PixelBlock | null
    {
        const key = Utils.generateKeyFromCoord(x, z);
        return this._blockMapByCoord.get(key) || null;
    }
}


