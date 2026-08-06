import { Vec3 } from 'cc';
import { EColor } from '../enums/EColor';

/**
 * Schema classes that match the structure of the 3D cube level JSON files
 * (assets/_ikame/configs/jsons/levelData/cube3D/*.json).
 * These are used only for parsing JsonAsset -> LevelData3D runtime objects.
 */
export class LevelJson3DVector3 {
    x?: number;
    y?: number;
    z?: number;
}

export class LevelJson3DCube {
    GridPosition?: LevelJson3DVector3;
    Color?: number;
    Health?: number;
}

export class LevelJson3DShooterSpawn {
    Color?: number;
    Ammo?: number;
    Line?: number;
    Index?: number;
    ConnectionGroup?: number;
    IsMystery?: boolean;
    FrozenAmmo?: number;
    Tunnel?: number[];
    TunnelSlotCount?: number;
    SecondColor?: number;
    SecondAmmo?: number;
}

export class LevelJson3DRoot {
    GridSize?: LevelJson3DVector3;
    CellSize?: number;
    GridOrigin?: LevelJson3DVector3;
    DefaultRotation?: LevelJson3DVector3;
    Cubes?: LevelJson3DCube[];
    LineCount?: number;
    ShooterSpawnData?: LevelJson3DShooterSpawn[];
    Difficulty?: number;
    IntroStyle?: number;
    IntroStartFrom?: number;

    // Editor-only fields (ignored at runtime, kept for completeness)
    EditorSelectedColor?: number;
    EditorActiveLayer?: number;
    EditorSoloLayer?: boolean;
    EditorRevealMode?: number;
    EditorSliceAxis?: number;
}

/** A single cube of the target model, addressed by integer grid coordinates. */
export class CubeData3D {
    public x: number = 0;

    public y: number = 0;

    public z: number = 0;

    public color: number = 0;

    /** Number of hits required to destroy this cube. */
    public health: number = 1;
}

/** A single shooter placed on the conveyor lines around the grid. */
export class ShooterSpawnData3D {
    public color: number = 0;

    public ammo: number = 0;

    /** Which conveyor line this shooter belongs to. */
    public line: number = 0;

    /** Order of the shooter inside its line. */
    public index: number = 0;

    /** Shooters sharing a non-zero group are linked together. */
    public connectionGroup: number = 0;

    public isMystery: boolean = false;

    /** Part of `ammo` that starts frozen (not extra ammo). */
    public frozenAmmo: number = 0;

    public tunnel: number[] = [];

    public tunnelSlotCount: number = 1;

    /** Second color revealed after `ammo` runs out, or -1 when unused. */
    public secondColor: number = -1;

    public secondAmmo: number = 0;

    public get hasSecondColor(): boolean {
        return this.secondColor >= 0 && this.secondAmmo > 0;
    }
}

export class LevelData3D {
    public gridSize: Vec3 = new Vec3(10, 10, 10);

    public cellSize: number = 0.2;

    public gridOrigin: Vec3 = new Vec3();

    /** Euler angles (degrees) the grid is presented with by default. */
    public defaultRotation: Vec3 = new Vec3();

    public cubes: CubeData3D[] = [];

    public lineCount: number = 0;

    public shooters: ShooterSpawnData3D[] = [];

    public difficulty: number = 0;

    public introStyle: number = 0;

    public introStartFrom: number = 0;

    public levelJson: string = null;

    constructor(jsonText: string) {
        this.levelJson = jsonText;
        this.parseData();
    }

    public parseData(): LevelData3D {
        if (!this.levelJson) {
            console.warn('[LevelData3D] levelJson is null/empty, skip parseData()');
            this.cubes = [];
            this.shooters = [];
            return this;
        }

        const root = JSON.parse(this.levelJson) as LevelJson3DRoot;

        this.gridSize = this.toVec3(root.GridSize, this.gridSize);
        this.gridOrigin = this.toVec3(root.GridOrigin, this.gridOrigin);
        this.defaultRotation = this.toVec3(root.DefaultRotation, this.defaultRotation);

        this.cellSize = (typeof root.CellSize === 'number' ? root.CellSize : this.cellSize);
        this.difficulty = (typeof root.Difficulty === 'number' ? root.Difficulty : 0);
        this.introStyle = (typeof root.IntroStyle === 'number' ? root.IntroStyle : 0);
        this.introStartFrom = (typeof root.IntroStartFrom === 'number' ? root.IntroStartFrom : 0);

        // Parse cubes
        const cubesJson = root.Cubes;
        if (Array.isArray(cubesJson)) {
            const parsedCubes: CubeData3D[] = [];
            for (const c of cubesJson) {
                const cube = new CubeData3D();
                const pos = c?.GridPosition;
                cube.x = (pos?.x ?? 0) as number;
                cube.y = (pos?.y ?? 0) as number;
                cube.z = (pos?.z ?? 0) as number;
                cube.color = (c?.Color ?? 0) as number;
                cube.health = (c?.Health ?? 1) as number;
                parsedCubes.push(cube);
            }
            this.cubes = parsedCubes;
        } else {
            this.cubes = [];
        }

        // Parse shooters
        const shootersJson = root.ShooterSpawnData;
        if (Array.isArray(shootersJson)) {
            const parsedShooters: ShooterSpawnData3D[] = [];
            for (const s of shootersJson) {
                const shooter = new ShooterSpawnData3D();
                shooter.color = (s?.Color ?? 0) as number;
                shooter.ammo = (s?.Ammo ?? 0) as number;
                shooter.line = (s?.Line ?? 0) as number;
                shooter.index = (s?.Index ?? 0) as number;
                shooter.connectionGroup = (s?.ConnectionGroup ?? 0) as number;
                shooter.isMystery = (s?.IsMystery ?? false) as boolean;
                shooter.frozenAmmo = (s?.FrozenAmmo ?? 0) as number;
                shooter.tunnel = (Array.isArray(s?.Tunnel) ? (s!.Tunnel as number[]) : []);
                shooter.tunnelSlotCount = (s?.TunnelSlotCount ?? 1) as number;
                shooter.secondColor = (s?.SecondColor ?? -1) as number;
                shooter.secondAmmo = (s?.SecondAmmo ?? 0) as number;
                parsedShooters.push(shooter);
            }
            this.shooters = parsedShooters;
        } else {
            this.shooters = [];
        }

        // LineCount is authoritative when present, otherwise derive it from the shooters
        if (typeof root.LineCount === 'number') {
            this.lineCount = root.LineCount;
        } else {
            let maxLine = -1;
            for (const shooter of this.shooters) {
                if (shooter.line > maxLine) maxLine = shooter.line;
            }
            this.lineCount = maxLine + 1;
        }

        return this;
    }

    /** Shooters grouped by line, each line sorted by its index. */
    public getShootersByLine(): ShooterSpawnData3D[][] {
        const lines: ShooterSpawnData3D[][] = [];
        for (let i = 0; i < this.lineCount; i++) {
            lines.push([]);
        }

        for (const shooter of this.shooters) {
            while (lines.length <= shooter.line) {
                lines.push([]);
            }
            lines[shooter.line].push(shooter);
        }

        for (const line of lines) {
            line.sort((a, b) => a.index - b.index);
        }

        return lines;
    }

    /** Shooters that belong to the same (non-zero) connection group. */
    public getConnectedShooters(group: number): ShooterSpawnData3D[] {
        if (group === 0) return [];
        return this.shooters.filter(s => s.connectionGroup === group);
    }

    /** Lookup table keyed by `x_y_z` so cubes can be resolved by grid coordinate. */
    public buildCubeLookup(): Map<string, CubeData3D> {
        const lookup = new Map<string, CubeData3D>();
        for (const cube of this.cubes) {
            lookup.set(LevelData3D.gridKey(cube.x, cube.y, cube.z), cube);
        }
        return lookup;
    }

    public static gridKey(x: number, y: number, z: number): string {
        return `${x}_${y}_${z}`;
    }

    private toVec3(source: LevelJson3DVector3 | undefined, fallback: Vec3): Vec3 {
        return new Vec3(
            typeof source?.x === 'number' ? source.x : fallback.x,
            typeof source?.y === 'number' ? source.y : fallback.y,
            typeof source?.z === 'number' ? source.z : fallback.z
        );
    }

    /** Total hits needed per color (a cube with health N needs N bullets). */
    private countHitsByColor(): Map<number, number> {
        const hitsByColor = new Map<number, number>();
        for (const cube of this.cubes) {
            const health = cube.health > 0 ? cube.health : 1;
            hitsByColor.set(cube.color, (hitsByColor.get(cube.color) || 0) + health);
        }
        return hitsByColor;
    }

    /** Total ammo per color, including the second color of dual shooters. */
    private countAmmoByColor(): Map<number, number> {
        const ammoByColor = new Map<number, number>();
        for (const shooter of this.shooters) {
            ammoByColor.set(shooter.color, (ammoByColor.get(shooter.color) || 0) + shooter.ammo);
            if (shooter.hasSecondColor) {
                ammoByColor.set(
                    shooter.secondColor,
                    (ammoByColor.get(shooter.secondColor) || 0) + shooter.secondAmmo
                );
            }
        }
        return ammoByColor;
    }

    private collectAllColors(
        hitsByColor: Map<number, number>,
        ammoByColor: Map<number, number>
    ): number[] {
        const seen: Record<string, true> = Object.create(null);
        const allColors: number[] = [];

        const addColor = (color: number) => {
            const key = String(color);
            if (seen[key]) return;
            seen[key] = true;
            allColors.push(color);
        };

        // Avoid relying on iterator/spread/Set iteration (can differ in older build targets)
        hitsByColor.forEach((_v, k) => addColor(k));
        ammoByColor.forEach((_v, k) => addColor(k));

        return allColors;
    }

    public verifyData(): void {
        const hitsByColor = this.countHitsByColor();
        const ammoByColor = this.countAmmoByColor();
        const allColors = this.collectAllColors(hitsByColor, ammoByColor);

        console.log('===== VERIFY LEVEL DATA 3D =====');
        console.log(`Grid ${this.gridSize.x}x${this.gridSize.y}x${this.gridSize.z}, cubes: ${this.cubes.length}, shooters: ${this.shooters.length}, lines: ${this.lineCount}`);

        let hasError = false;

        for (let i = 0; i < allColors.length; i++) {
            const color = allColors[i];
            const name = EColor[color] ?? color;
            const hitCount = hitsByColor.get(color) || 0;
            const ammoCount = ammoByColor.get(color) || 0;

            if (hitCount > ammoCount) {
                console.warn(`Color ${name}: Cubes (${hitCount}) > Bullets (${ammoCount}) - Missing ${hitCount - ammoCount} bullets!`);
                hasError = true;
            } else if (hitCount < ammoCount) {
                console.warn(`Color ${name}: Cubes (${hitCount}) < Bullets (${ammoCount}) - Excess ${ammoCount - hitCount} bullets!`);
                hasError = true;
            } else {
                console.log(`Color ${name}: ✓ Match (${hitCount} hits = ${ammoCount} bullets)`);
            }
        }

        if (!hasError) {
            console.log('✓ Level data is valid - Cube and bullet counts match!');
        } else {
            console.error("✗ Level data has errors - Cube and bullet counts don't match!");
        }

        console.log('================================');
    }

    /**
     * Adjust shooter ammo per color so that it matches the number of hits the cubes of
     * that color require. Missing ammo is added to the last shooter of that color,
     * excess ammo is trimmed from the last shooter backwards.
     * Only the primary color of each shooter is adjusted; dual shooters keep their second color.
     */
    public correctLevelData(): void {
        const hitsByColor = this.countHitsByColor();
        const ammoByColor = this.countAmmoByColor();
        const allColors = this.collectAllColors(hitsByColor, ammoByColor);

        console.log('===== CORRECT LEVEL DATA 3D =====');
        console.log(`Colors to check: ${allColors.map(c => EColor[c] ?? c).join(', ')}`);

        for (let i = 0; i < allColors.length; i++) {
            const color = allColors[i];
            const name = EColor[color] ?? color;
            const hitCount = hitsByColor.get(color) || 0;
            const ammoCount = ammoByColor.get(color) || 0;
            const diff = hitCount - ammoCount;

            if (diff === 0) {
                console.log(`Color ${name}: ✓ Match (${hitCount} hits = ${ammoCount} bullets)`);
                continue;
            }

            const shooters = this.shooters.filter(s => s.color === color);
            if (shooters.length === 0) {
                console.log(`Color ${name}: No shooters available.`);
                continue;
            }

            if (diff > 0) {
                // Not enough bullets, add to the last shooter
                shooters[shooters.length - 1].ammo += diff;
                console.log(`Added ${diff} bullets for color ${name} to the last shooter.`);
            } else {
                // Too many bullets, remove from last shooter to first
                let remainToRemove = -diff;
                for (let j = shooters.length - 1; j >= 0 && remainToRemove > 0; j--) {
                    const shooter = shooters[j];
                    if (shooter.ammo > remainToRemove) {
                        shooter.ammo -= remainToRemove;
                        remainToRemove = 0;
                    } else {
                        remainToRemove -= shooter.ammo;
                        shooter.ammo = 0;
                    }
                    if (shooter.frozenAmmo > shooter.ammo) {
                        shooter.frozenAmmo = shooter.ammo;
                    }
                }
                console.log(`Removed ${-diff} bullets for color ${name} from shooters.`);
            }
        }

        console.log('=================================');
    }
}
