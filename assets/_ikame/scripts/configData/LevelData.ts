import { _decorator, CCInteger, JsonAsset } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';
const { ccclass, property } = _decorator;

@ccclass('Shooter')
export class Shooter {
    @property(CCInteger)
    public id: number = 0;

    @property(CCInteger)
    public ammo: number = 0;

    @property(CCInteger)
    public material: number = 0;
}

@ccclass('ShooterQueue')
export class ShooterQueue {
    @property([Shooter])
    public shooters: Shooter[] = [];
}

@ccclass('PixelData')
export class PixelData {
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

        // Flip Y axis for pixels
        const flippedPixels: PixelData[] = [];
        for (const pixel of this.pixels) {
            const flippedPixel = new PixelData();
            flippedPixel.x = pixel.x;
            flippedPixel.y = this.heightMap - pixel.y - pixel.areaY;
            flippedPixel.material = pixel.material;
            flippedPixel.areaX = pixel.areaX;
            flippedPixel.areaY = pixel.areaY;
            flippedPixels.push(flippedPixel);
        }   

        this.pixels = flippedPixels;

        return this;
    }

    public verifyData(): void 
    {
        // Đếm số lượng pixel cho từng màu
        const pixelCountByColor = new Map<number, number>();
        
        for (const pixel of this.pixels) {
            const material = pixel.material;
            const pixelArea = pixel.areaX * pixel.areaY;
            
            if (pixelCountByColor.has(material)) {
                pixelCountByColor.set(material, pixelCountByColor.get(material)! + pixelArea);
            } else {
                pixelCountByColor.set(material, pixelArea);
            }
        }

        // Đếm số lượng đạn cho từng màu từ các shooter
        const bulletCountByColor = new Map<number, number>();
        
        for (const queue of this.shooterQueues) {
            for (const shooter of queue.shooters) {
                const material = shooter.material;
                const ammo = shooter.ammo;
                
                if (bulletCountByColor.has(material)) {
                    bulletCountByColor.set(material, bulletCountByColor.get(material)! + ammo);
                } else {
                    bulletCountByColor.set(material, ammo);
                }
            }
        }

        // Compare and log results
        console.log("===== VERIFY LEVEL DATA =====");
        
        // Get all colors that appear
        const allColors = new Set<number>([...pixelCountByColor.keys(), ...bulletCountByColor.keys()]);
        
        let hasError = false;
        
        for (const color of allColors) {
            const pixelCount = pixelCountByColor.get(color) || 0;
            const bulletCount = bulletCountByColor.get(color) || 0;
            
            if (pixelCount > bulletCount) {
                console.warn(`Color ${color}: Pixels (${pixelCount}) > Bullets (${bulletCount}) - Missing ${pixelCount - bulletCount} bullets!`);
                hasError = true;
            } else if (pixelCount < bulletCount) {
                console.warn(`Color ${color}: Pixels (${pixelCount}) < Bullets (${bulletCount}) - Excess ${bulletCount - pixelCount} bullets!`);
                hasError = true;
            } else {
                console.log(`Color ${color}: ✓ Match (${pixelCount} pixels = ${bulletCount} bullets)`);
            }
        }
        
        if (!hasError) {
            console.log("✓ Level data is valid - Pixel and bullet counts match!");
        } else {
            console.error("✗ Level data has errors - Pixel and bullet counts don't match!");
        }
        
        console.log("=============================");
    }
}


