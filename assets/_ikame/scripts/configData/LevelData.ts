import { _decorator, CCInteger, JsonAsset } from 'cc';
import { bh } from 'db://scriptable-asset/scriptable_runtime';
const { ccclass, property } = _decorator;

/**
 * Schema classes that match the structure of current level JSON files.
 * These are used only for parsing JsonAsset -> LevelData runtime objects.
 */
export class LevelJsonShooter {
    id?: number;
    ammo?: number;
    material?: number;
    isLock?: boolean;
}

export class LevelJsonShooterQueue {
    shooters?: LevelJsonShooter[];
}

export class LevelJsonQueueGroup {
    shooterQueues?: LevelJsonShooterQueue[];
}

export class LevelJsonPixel {
    x?: number;
    y?: number;
    material?: number;
    areaX?: number;
    areaY?: number;
}

export class LevelJsonPixelImageData {
    width?: number;
    height?: number;
    physicalWidth?: number;
    physicalHeight?: number;
    pixels?: LevelJsonPixel[];
}

export class LevelJsonConnectedShooter {
    Id?: number;
    Shooters?: number[];
}

export class LevelJsonConnectedShooters {
    Connections?: LevelJsonConnectedShooter[];
}

export class LevelJsonRoot {
    QueueGroup?: LevelJsonQueueGroup;
    SurpriseShooters?: { Shooters?: unknown[] };
    ConnectedShooters?: LevelJsonConnectedShooters;
    PixelImageData?: LevelJsonPixelImageData;

    // Legacy/alternate shapes (keep optional)
    slotCount?: number;
    widthMap?: number;
    heightMap?: number;
    shooterQueues?: ShooterQueue[];
    pixels?: PixelData[];
    connectedShooters?: LinkedShooterData[];
}

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

export class LinkedShooterData 
{
    @property(CCInteger)
    Id: number = 0;
    
    @property([ CCInteger ])
    Shooters: number[] = [];
}


@bh.createAssetMenu('LevelData', 'ScriptableAsset/LevelData')
@bh.scriptable('LevelData')
export class LevelData extends bh.ScriptableAsset 
{
    @property(CCInteger) 
    public conveyorCapacity: number = 5;

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

    @property([ LinkedShooterData ])
    public connectedShooters: LinkedShooterData[] = [];

    doStart(): LevelData 
    {
        this.parseData();
        this.correctLevelData();
        return this;
    }

    public parseData(): LevelData
    {   
        if (!this.levelJson || !this.levelJson.json) {
            console.warn('[LevelData] levelJson is null/empty, skip parseData()');
            this.shooterQueues = [];
            this.pixels = [];
            this.connectedShooters = [];
            this.slotCount = this.slotCount || 0;
            return this;
        }

        const root = this.levelJson.json as unknown as LevelJsonRoot;

        // Prefer current schema: PixelImageData.width/height
        const widthFromJson = root.PixelImageData?.width;
        const heightFromJson = root.PixelImageData?.height;
        this.widthMap = (typeof widthFromJson === 'number' ? widthFromJson : root.widthMap) ?? this.widthMap;
        this.heightMap = (typeof heightFromJson === 'number' ? heightFromJson : root.heightMap) ?? this.heightMap;

        // slotCount is not present in this JSON example; keep safe fallback.
        this.slotCount = (typeof root.slotCount === 'number' ? root.slotCount : this.slotCount) ?? 0;

        // Parse shooterQueues
        const shooterQueuesJson = root.QueueGroup?.shooterQueues;
        if (Array.isArray(shooterQueuesJson)) {
            const parsedQueues: ShooterQueue[] = [];
            for (const q of shooterQueuesJson) {
                const queue = new ShooterQueue();
                queue.shooters = [];

                const shootersJson = q?.shooters;
                if (Array.isArray(shootersJson)) {
                    for (const s of shootersJson) {
                        const shooter = new Shooter();
                        shooter.id = (s?.id ?? 0) as number;
                        shooter.ammo = (s?.ammo ?? 0) as number;
                        shooter.material = (s?.material ?? 0) as number;
                        queue.shooters.push(shooter);
                    }
                }

                parsedQueues.push(queue);
            }
            this.shooterQueues = parsedQueues;
        } else if (Array.isArray(root.shooterQueues)) {
            // Legacy shape support
            this.shooterQueues = root.shooterQueues;
        } else {
            this.shooterQueues = [];
        }

        // Parse connectedShooters
        const connectionsJson = root.ConnectedShooters?.Connections;
        if (Array.isArray(connectionsJson)) {
            const parsedConnections: LinkedShooterData[] = [];
            for (const c of connectionsJson) {
                const link = new LinkedShooterData();
                link.Id = (c?.Id ?? 0) as number;
                link.Shooters = (Array.isArray(c?.Shooters) ? (c!.Shooters as number[]) : []);
                parsedConnections.push(link);
            }
            this.connectedShooters = parsedConnections;
        } else if (Array.isArray(root.connectedShooters)) {
            // Legacy shape support
            this.connectedShooters = root.connectedShooters;
        } else {
            this.connectedShooters = [];
        }

        // Parse pixels
        const pixelsJson = root.PixelImageData?.pixels;
        if (Array.isArray(pixelsJson)) {
            const parsedPixels: PixelData[] = [];
            for (const p of pixelsJson) {
                const pixel = new PixelData();
                pixel.x = (p?.x ?? 0) as number;
                pixel.y = (p?.y ?? 0) as number;
                pixel.material = (p?.material ?? 0) as number;
                pixel.areaX = (p?.areaX ?? 1) as number;
                pixel.areaY = (p?.areaY ?? 1) as number;
                parsedPixels.push(pixel);
            }
            this.pixels = parsedPixels;
        } else if (Array.isArray(root.pixels)) {
            // Legacy shape support
            this.pixels = root.pixels;
        } else {
            this.pixels = [];
        }

        // Flip Y axis for pixels
        const flippedPixels: PixelData[] = [];
        for (const pixel of this.pixels) {
            const flippedPixel = new PixelData();
            const areaY = pixel.areaY ?? 1;
            flippedPixel.x = pixel.x;
            flippedPixel.y = this.heightMap - pixel.y - areaY;
            flippedPixel.material = pixel.material;
            flippedPixel.areaX = pixel.areaX ?? 1;
            flippedPixel.areaY = areaY;
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


