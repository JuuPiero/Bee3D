import { _decorator, Material } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';
const { ccclass, property } = _decorator;

@bh.createAssetMenu('ColorData', 'ScriptableAsset/ColorData')
@bh.scriptable('ColorData')
export class ColorData extends bh.ScriptableAsset {
    @property([ Material ])
    public materials: Material[] = [];

    public getColorById(id: number): Material {
        return this.materials[id % this.materials.length];
    }
}


