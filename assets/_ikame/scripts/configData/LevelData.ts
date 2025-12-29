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

    doStart(): LevelData 
    {
        this.parseData();
        this.correctLevelData();
        return this;
    }

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

    /**
     * Tự động điều chỉnh số lượng bullet của shooter cho từng màu sao cho khớp với số lượng pixel cùng màu.
     * Nếu thiếu thì bổ sung, nếu thừa thì cắt bớt.
     */
    public correctLevelData(): void {
        // Count number of pixels for each color
        const pixelCountByColor = new Map<number, number>();
        for (const pixel of this.pixels) {
            const material = pixel.material;
            const pixelArea = pixel.areaX * pixel.areaY;
            pixelCountByColor.set(material, (pixelCountByColor.get(material) || 0) + pixelArea);
        }

        // Count number of bullets for each color from shooters
        const bulletCountByColor = new Map<number, number>();
        for (const queue of this.shooterQueues) {
            for (const shooter of queue.shooters) {
                const material = shooter.material;
                const ammo = shooter.ammo;
                bulletCountByColor.set(material, (bulletCountByColor.get(material) || 0) + ammo);
            }
        }

        // Get all colors that appear
        const allColors = new Set<number>([...pixelCountByColor.keys(), ...bulletCountByColor.keys()]);

        for (const color of allColors) {
            const pixelCount = pixelCountByColor.get(color) || 0;
            let bulletCount = bulletCountByColor.get(color) || 0;
            const diff = pixelCount - bulletCount;
            if (diff === 0) continue; // Already matched

            // Get all shooters of this color
            const shooters: Shooter[] = [];
            for (const queue of this.shooterQueues) {
                for (const shooter of queue.shooters) {
                    if (shooter.material === color) {
                        shooters.push(shooter);
                    }
                }
            }
            if (shooters.length === 0) continue; // No shooter for this color

            if (diff > 0) {
                // Not enough bullets, add to the last shooter
                shooters[shooters.length - 1].ammo += diff;
                console.log(`Added ${diff} bullets for color ${color} to the last shooter.`);
            } else if (diff < 0) {
                // Too many bullets, remove from last shooter to first
                let remainToRemove = -diff;
                for (let i = shooters.length - 1; i >= 0 && remainToRemove > 0; i--) {
                    const shooter = shooters[i];
                    if (shooter.ammo > remainToRemove) {
                        shooter.ammo -= remainToRemove;
                        remainToRemove = 0;
                    } else {
                        remainToRemove -= shooter.ammo;
                        shooter.ammo = 0;
                    }
                }
                console.log(`Removed ${-diff} bullets for color ${color} from shooters.`);
            }
        }
    }
}


