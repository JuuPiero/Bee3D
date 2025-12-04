import { _decorator, CCInteger } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';
const { ccclass, property } = _decorator;

@ccclass('PixelData')
class PixelData 
{
    @property(CCInteger)
    public id: number = 0;
    
    @property(CCInteger)
    public x: number = 0;

    @property(CCInteger)
    public z: number = 0;
}



@bh.createAssetMenu('LevelData', 'ScriptableAsset/LevelData')
@bh.scriptable('LevelData')
export class LevelData extends bh.ScriptableAsset 
{
    @property(CCInteger)
    public widthMap: number = 10;

    @property(CCInteger)
    public heightMap: number = 10;

    @property([PixelData])
    public pixels: PixelData[] = [];
}


