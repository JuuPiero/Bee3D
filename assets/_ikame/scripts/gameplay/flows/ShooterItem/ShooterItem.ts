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
        
    }

    private shotTargetsBottom(): void 
    {
        const z = this.levelController.levelData.heightMap - 1;
        let x = this.levelController.levelData.widthMap - 1;
        while (x >= 0)
        {
            let protentialTarget = this.levelController.getBlockAtCoord(x, z);
            
        }
    }
}


