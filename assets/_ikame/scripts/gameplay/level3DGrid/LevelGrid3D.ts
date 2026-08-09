import { _decorator, CCInteger, Component, instantiate, JsonAsset, Node, Prefab, Vec3 } from 'cc';
import { LevelData3D } from '../../configData/LevelData3D';
import { GridTile3D } from './GridTile3D';
import { IGridTile3D } from './IGridTile3D';
import { PixelBlock } from '../flows/Block/PixelBlock';
import { OcclusionManager } from '../../cube-occlusion/manager/OcclusionManager';
import { OcclusionTarget } from '../../cube-occlusion/component/OcclusionTarget';
import { Occluder } from '../../cube-occlusion/component/Occluder';
const { ccclass, property } = _decorator;

interface OcclusionEntry
{
    target: OcclusionTarget;
    occluder: Occluder;
    block: PixelBlock;
}

@ccclass('LevelGrid3D')
export class LevelGrid3D extends Component
{
    @property({ type: Prefab, group: 'Cube Map' })
    public cubeBlockPrefab: Prefab = null;

    @property({ type: Node, group: 'Cube Map' })
    public cubeBlockHolder: Node = null;

    @property({ type: [ JsonAsset ], group: 'LevelData' })
    public levelJsonAssets: JsonAsset[] = [];

    @property({ type: CCInteger, group: 'LevelData' })
    public levelIndex: number = 0;

    @property({ type: OcclusionManager, group: 'Occlusion' })
    public occlusionManager: OcclusionManager = null;

    @property({ type: Vec3, group: 'Occlusion' })
    public occlusionBoxSize: Vec3 = new Vec3(1, 1, 1);

    @property({ type: CCInteger, group: 'Occlusion' })
    public visibilitySampleCountHideThreshold: number = 0;

    public levelData: LevelData3D = null;

    private _gridMap = new Map<string, GridTile3D>();

    private _occlusionEntries: OcclusionEntry[] = [];

    // Reused every lateUpdate() to avoid allocating a new array per cube per frame.
    private _occluderScratch: Occluder[] = [];

    start() 
    {
        this.spawnLevel();
    }

    public spawnLevel(): void
    {
        var textJson = JSON.stringify(this.levelJsonAssets[this.levelIndex].json);
        this.levelData = new LevelData3D(textJson);

        const gridSize = this.levelData.gridSize;

        const cubeBounds = this.computeCubeBounds(gridSize);
        const offsetX = -(cubeBounds.minX + cubeBounds.maxX) / 2;
        const offsetZ = -(cubeBounds.minZ + cubeBounds.maxZ) / 2;
        const offsetY = -(cubeBounds.minY + cubeBounds.maxY) / 2;

        for (let x = 0; x < gridSize.x; x++)
        {
            for (let y = 0; y < gridSize.y; y++)
            {
                for (let z = 0; z < gridSize.z; z++)
                {
                    const key = LevelData3D.gridKey(x, y, z);
                    const gridTile = new GridTile3D(x, y, z, this.cubeBlockHolder, new Vec3(x + offsetX, y + offsetY, z + offsetZ));
                    this._gridMap.set(key, gridTile);
                }
            }
        }

        for (const tile of this._gridMap.values())
        {
            const x = tile.getCoordX();
            const y = tile.getCoordY();
            const z = tile.getCoordZ();
            const upTile = this._gridMap.get( LevelData3D.gridKey(x, y + 1, z) ) || null;
            const downTile = this._gridMap.get( LevelData3D.gridKey(x, y - 1, z) ) || null;
            const topTile = this._gridMap.get( LevelData3D.gridKey(x, y, z - 1) ) || null;
            const bottomTile = this._gridMap.get( LevelData3D.gridKey(x, y, z + 1) ) || null;
            const leftTile = this._gridMap.get( LevelData3D.gridKey(x - 1, y, z) ) || null;
            const rightTile = this._gridMap.get( LevelData3D.gridKey(x + 1, y, z) ) || null;
            tile.setLinkedTiles(upTile, downTile, topTile, bottomTile, leftTile, rightTile);
        }

        let spawnedCount = 0;
        for (let i = 0; i < this.levelData.cubes.length; i++)
        {
            const cubeData = this.levelData.cubes[i];
            const key = LevelData3D.gridKey(cubeData.x, cubeData.y, cubeData.z);
            const gridTile = this._gridMap.get(key);
            if (!gridTile)
            {
                console.warn(`[LevelGrid3D] Cube at (${cubeData.x}, ${cubeData.y}, ${cubeData.z}) is outside GridSize, skipped.`);
                continue;
            }

            const cubeNode = instantiate(this.cubeBlockPrefab);
            cubeNode.setParent(this.cubeBlockHolder);
            cubeNode.setWorldPosition(gridTile.getWorldPos());
            gridTile.setCubeData(cubeData.color, cubeData.health);
            const blockComp = cubeNode.getComponent(PixelBlock)
            gridTile.setBlock(cubeNode, blockComp);
            blockComp.init(cubeData.color, null , null, null)

            const occlusionTarget = cubeNode.addComponent(OcclusionTarget);
            occlusionTarget.size.set(this.occlusionBoxSize);
            occlusionTarget.rebuildSamples();

            const occluder = cubeNode.addComponent(Occluder);
            occluder.size.set(this.occlusionBoxSize);

            this._occlusionEntries.push({ target: occlusionTarget, occluder, block: blockComp });

            spawnedCount++;
        }

        console.log(`[LevelGrid3D] Grid ${gridSize.x}x${gridSize.y}x${gridSize.z}, tiles: ${this._gridMap.size}, cubes spawned: ${spawnedCount}/${this.levelData.cubes.length}`);
    }

    lateUpdate(): void
    {
        if (!this.occlusionManager) return;

        for (const entry of this._occlusionEntries)
        {
            if (!entry.block || !entry.block.isValid) continue;

            // Build the occluder list for this cube's own check, excluding its own
            // occluder box so it can never self-occlude (it shares the same node/
            // position as its OcclusionTarget).
            this._occluderScratch.length = 0;
            for (const other of this._occlusionEntries)
            {
                if (other.occluder !== entry.occluder) this._occluderScratch.push(other.occluder);
            }

            const result = this.occlusionManager.checkVisibility(entry.target, this._occluderScratch);
            entry.block.setVisible(result.visibleSamples > this.visibilitySampleCountHideThreshold);
        }
    }

    public clearLevel(): void
    {
        this._occlusionEntries.length = 0;

        this.cubeBlockHolder.destroyAllChildren();
        this._gridMap.clear();
    }

    public getTileAtCoord(x: number, y: number, z: number): IGridTile3D | null
    {
        return this._gridMap.get( LevelData3D.gridKey(x, y, z) ) || null;
    }


    private computeCubeBounds(gridSize: Vec3): { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }
    {
        const cubes = this.levelData.cubes;
        if (!cubes || cubes.length === 0)
        {
            return { minX: 0, maxX: gridSize.x - 1, minY: 0, maxY: gridSize.y - 1, minZ: 0, maxZ: gridSize.z - 1 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const cube of cubes)
        {
            if (cube.x < minX) minX = cube.x;
            if (cube.x > maxX) maxX = cube.x;
            if (cube.y < minY) minY = cube.y;
            if (cube.y > maxY) maxY = cube.y;
            if (cube.z < minZ) minZ = cube.z;
            if (cube.z > maxZ) maxZ = cube.z;
        }

        return { minX, maxX, minY, maxY, minZ, maxZ };
    }
}
