import { _decorator, CCInteger, JsonAsset } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';
const { ccclass, property } = _decorator;

@ccclass('Shooter')
class Shooter {
    @property(CCInteger)
    public id: number = 0;

    @property(CCInteger)
    public ammo: number = 0;

    @property(CCInteger)
    public material: number = 0;
}

@ccclass('ShooterQueue')
class ShooterQueue {
    @property([Shooter])
    public shooters: Shooter[] = [];
}

@ccclass('PixelData')
class PixelData {
    @property(CCInteger)
    public x: number = 0;

    @property(CCInteger)
    public y: number = 0;

    @property(CCInteger)
    public material: number = 0;

    @property(CCInteger)
    public areaX: number = 1;

    @property(CCInteger)
    public areaY: number = 1;
}


@bh.createAssetMenu('LevelData', 'ScriptableAsset/LevelData')
@bh.scriptable('LevelData')
export class LevelData extends bh.ScriptableAsset 
{
    @property(CCInteger)
    public slotCount: number = 0;

    @property(CCInteger)
    public widthMap: number = 10;

    @property(CCInteger)
    public heightMap: number = 10;

    // @property([ShooterQueue])
    public shooterQueues: ShooterQueue[] = [];

    // @property([PixelData])
    public pixels: PixelData[] = [];

    @property(JsonAsset)
    public levelJson: JsonAsset = null;

    public parseData(): LevelData
    {   
        const data = this.levelJson.json as LevelData;
        this.slotCount = data.slotCount;
        this.widthMap = data.widthMap;
        this.heightMap = data.heightMap;
        this.shooterQueues = data.shooterQueues;
        this.pixels = data.pixels;

        return this;
    }
}


