import { _decorator, CCString, Color, Enum, Material } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';
import { EColor } from '../enums/EColor';
const { ccclass, property } = _decorator;

@ccclass('ColorData')
export class ColorData 
{
    @property({ type: Enum(EColor) })
    public colorEnum: EColor = EColor.Red;

    @property({ type: Material })
    public pixelBlockMaterial: Material = null;
    
    @property({ type: Material })
    public chracterMaterial: Material = null;

    private _mainColorArr: number[] = null;
    private _shadowColorArr: number[] = null;

    constructor(colorID : number , mainColorHex : string, shadowColorHex : string)
    {
        this.colorEnum = colorID;
    }

    public getColorArray(colorHex: string): number[]
    {
        const color = new Color();
        Color.fromHEX(color, colorHex);
        return [color.r / 255, color.g / 255, color.b / 255, color.a / 255];
    }

    public get mainColorArr(): number[]
    {
        return this._mainColorArr;
    }

    public get shadowColorArr(): number[]
    {
        return this._shadowColorArr;
    }
}

class ColorDataParser
{
    materialId: number;
    mainColorHex: string;
    shadowColorHex: string;
}

class ColorConfigParser 
{
    colors: ColorDataParser[];
}

@bh.createAssetMenu('ColorConfig', 'ScriptableAsset/ColorConfig')
@bh.scriptable('ColorConfig')
export class ColorConfig extends bh.ScriptableAsset
{
    @property([ ColorData ]) private colors: ColorData[] = [];

    _colorMap: Map<EColor, ColorData> = null;

    public getShooterColorById(id: EColor): Material
    {
        if (!this._colorMap)
        {
            this._colorMap = new Map<EColor, ColorData>();
            for (const colorData of this.colors)
            {
                this._colorMap.set(colorData.colorEnum, colorData);
            }
        }

        const colorData = this._colorMap.get(id);
        return colorData ? colorData.chracterMaterial : null;
    }

    public getPixelBlockMaterialById(id: EColor): Material
    {
        if (!this._colorMap)
        {
            this._colorMap = new Map<EColor, ColorData>();
            for (const colorData of this.colors)
            {
                this._colorMap.set(colorData.colorEnum, colorData);
            }
        }
        const colorData = this._colorMap.get(id);
        return colorData ? colorData.pixelBlockMaterial : null;
    }
}


