import { _decorator, CCInteger, Component, instantiate, JsonAsset, Node, Prefab, Vec3 } from 'cc';
import { LevelData3D } from '../../configData/LevelData3D';
import { GridTile3D } from './GridTile3D';
import { IGridTile3D } from './IGridTile3D';
import { PixelBlock } from '../flows/Block/PixelBlock';
const { ccclass, property } = _decorator;

const CUBE_BLOCK_SIZE = 1;

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

    public levelData: LevelData3D = null;

    private _gridMap = new Map<string, GridTile3D>();

    start() 
    {
        this.spawnLevel();
    }

    public spawnLevel(): void
    {
        var textJson = JSON.stringify(this.levelJsonAssets[this.levelIndex].json);
        this.levelData = new LevelData3D(textJson);

        const gridSize = this.levelData.gridSize;
        // Everything stays at unit size / scale 1 for now: cellSize, gridOrigin and
        // defaultRotation from the level data are intentionally not applied yet.
        const offsetX = (-gridSize.x / 2) + (CUBE_BLOCK_SIZE / 2);
        const offsetZ = (-gridSize.z / 2) + (CUBE_BLOCK_SIZE / 2);
        const offsetY = CUBE_BLOCK_SIZE / 2;

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
            gridTile.setBlock(cubeNode, cubeNode.getComponent(PixelBlock));
            spawnedCount++;
        }

        console.log(`[LevelGrid3D] Grid ${gridSize.x}x${gridSize.y}x${gridSize.z}, tiles: ${this._gridMap.size}, cubes spawned: ${spawnedCount}/${this.levelData.cubes.length}`);
    }

    public clearLevel(): void
    {
        this.cubeBlockHolder.destroyAllChildren();
        this._gridMap.clear();
    }

    public getTileAtCoord(x: number, y: number, z: number): IGridTile3D | null
    {
        return this._gridMap.get( LevelData3D.gridKey(x, y, z) ) || null;
    }
}
