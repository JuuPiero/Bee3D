import { _decorator, Component, EventKeyboard, Input, input, KeyCode, Node } from 'cc';
import { Utils } from '../../../utils/Utils';
import { LevelController } from '../../controllers/LevelController';
import { EDirection } from '../../../enums/EDirection';
const { ccclass, property } = _decorator;

@ccclass('ShooterItem')
export class ShooterItem extends Component {
    
    @property(LevelController)
    public levelController: LevelController = null;

    private _passedBlockCoords: Set<string> = new Set<string>();

    public markBlockAsPassed(x: number, z: number): void {
        const key = Utils.generateKeyFromCoord(x, z);
        this._passedBlockCoords.add(key);
    }

    public hasPassedBlock(x: number, z: number): boolean {
        const key = Utils.generateKeyFromCoord(x, z);
        return this._passedBlockCoords.has(key);
    }

    public clearPassedBlocks(): void {
        this._passedBlockCoords.clear();
    }

    protected start(): void
    {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    protected onDestroy(): void
    {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: EventKeyboard): void
    {
        // Example key handling logic
        if(event.keyCode === KeyCode.SPACE)
        {
            this.tryShootTargets();
        }
    }

    private tryShootTargets(): void
    {
        // Implement shooting logic here
        const edge = this.levelController.getShooterEdge(this.node.worldPosition.x, this.node.worldPosition.z);
        switch (edge)
        {
            case EDirection.BOTTOM:
                this.shotTargetsBottom();
                break;
            case EDirection.TOP:
                this.shotTargetsTop();
                break;
            case EDirection.LEFT:
                this.shotTargetsLeft();
                break;
            case EDirection.RIGHT:
                this.shotTargetsRight();
                break;
        }
    }

    private shotTargetsBottom(): void 
    {
        console.log("Shooting BOTTOM");
        const z = this.levelController.levelData.heightMap - 1;
        let x = this.levelController.levelData.widthMap - 1;
        while (x >= 0)
        {
            let protentialTileTarget = this.levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {  
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosX() > this.node.worldPositionX)
            {
                x--;
                continue;
            }

            if (!protentialTileTarget.isOccupied())
            {
                // Dig Upwards
                let upLinkedTile = protentialTileTarget.getTopLinkedTile();
                while (upLinkedTile)
                {
                    if (upLinkedTile.isOccupied())
                    {
                        protentialTileTarget = upLinkedTile;
                        break;
                    }
                    upLinkedTile = upLinkedTile.getTopLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block 2 at: ", targetBlock.getUid());
            x--;
        }
        console.log("----");
    }

    private shotTargetsTop(): void 
    {
        console.log("Shooting TOP");
        const z = 0;
        let x = this.levelController.levelData.widthMap - 1;
        while (x >= 0)
        {
            let protentialTileTarget = this.levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosX() > this.node.worldPositionX)
            {
                x--;
                continue;
            }

            if (!protentialTileTarget.isOccupied())
            {
                // Dig Downwards from top
                let downLinkedTile = protentialTileTarget.getBottomLinkedTile();
                while (downLinkedTile)
                {
                    if (downLinkedTile.isOccupied())
                    {
                        protentialTileTarget = downLinkedTile;
                        break;
                    }
                    downLinkedTile = downLinkedTile.getBottomLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block TOP at:", targetBlock.getUid());
            x--;
        }
        console.log("----");
    }

    private shotTargetsLeft(): void 
    {
        console.log("Shooting LEFT");
        const x = 0;
        let z = this.levelController.levelData.heightMap - 1;
        while (z >= 0)
        {
            let protentialTileTarget = this.levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosZ() > this.node.worldPositionZ)
            {
                z--;
                continue;
            }

            if (!protentialTileTarget.isOccupied())
            {
                // Dig Rightwards from left edge
                let rightLinkedTile = protentialTileTarget.getRightLinkedTile();
                while (rightLinkedTile)
                {
                    if (rightLinkedTile.isOccupied())
                    {
                        protentialTileTarget = rightLinkedTile;
                        break;
                    }
                    rightLinkedTile = rightLinkedTile.getRightLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block LEFT at:", targetBlock.getUid());
            z--;
        }
        console.log("----");
    }

    private shotTargetsRight(): void 
    {
        console.log("Shooting RIGHT");
        const x = this.levelController.levelData.widthMap - 1;
        let z = 0;
        while (z >= 0 && z < this.levelController.levelData.heightMap)
        {
            let protentialTileTarget = this.levelController.getTileAtCoord(x, z);
            if (!protentialTileTarget)
            {
                console.error("No tile found at coord:", x, z);
                return;
            }

            if (protentialTileTarget.getWorldPosZ() < this.node.worldPositionZ)
            {
                z++;
                continue;
            }

            if (!protentialTileTarget.isOccupied())
            {
                // Dig Leftwards from right edge
                let leftLinkedTile = protentialTileTarget.getLeftLinkedTile();
                while (leftLinkedTile)
                {
                    if (leftLinkedTile.isOccupied())
                    {
                        protentialTileTarget = leftLinkedTile;
                        break;
                    }
                    leftLinkedTile = leftLinkedTile.getLeftLinkedTile();
                }
            }

            const targetBlock = protentialTileTarget.getPixelBlock();
            console.log("Shooting Block RIGHT at:", targetBlock.getUid());
            z++;
        }
        console.log("----");
    }

    
}


