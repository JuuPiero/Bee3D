import { _decorator, CCString, Color, Enum } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';
import { EColor } from '../enums/EColor';
const { ccclass, property } = _decorator;

@ccclass('ColorData')
export class ColorData
{
    @property({ type: Enum(EColor) })
    public colorEnum: EColor = EColor.Red;

    @property(Color)
    public blockColor: Color = new Color(255, 255, 255, 255);

    @property(Color)
    public blockShadow: Color = new Color(0, 0, 0, 255);

    @property(Color)
    public characterColor: Color = new Color(255, 255, 255, 255);

    @property(Color)
    public characterShadow: Color = new Color(0, 0, 0, 255);
}

@bh.createAssetMenu('ColorConfig', 'ScriptableAsset/ColorConfig')
@bh.scriptable('ColorConfig')
export class ColorConfig extends bh.ScriptableAsset
{
    @property([ ColorData ]) private colors: ColorData[] = [];

    _colorMap: Map<EColor, ColorData> = null;

    private _ensureMap(): void
    {
        if (this._colorMap) return;
        this._colorMap = new Map<EColor, ColorData>();
        for (const colorData of this.colors)
        {
            this._colorMap.set(colorData.colorEnum, colorData);
        }
    }

    public getCharacterColors(id: EColor): { color: Color; shadow: Color } | null
    {
        this._ensureMap();
        const colorData = this._colorMap.get(id);
        if (!colorData) return null;
        return { color: colorData.characterColor, shadow: colorData.characterShadow };
    }

    public getBlockColors(id: EColor): { color: Color; shadow: Color } | null
    {
        this._ensureMap();
        const colorData = this._colorMap.get(id);
        if (!colorData) return null;
        return { color: colorData.blockColor, shadow: colorData.blockShadow };
    }
}


