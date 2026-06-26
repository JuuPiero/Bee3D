import { _decorator, Component, Node, Prefab, Vec3 } from 'cc';
import { IColorQueueControllers } from './IColorQueueControllers';
import { ColorQueue } from './ColorQueue';
import { ShooterQueue } from '../../configData/LevelData';
import { ILevelController } from '../controllers/ILevelController';
const { ccclass, property } = _decorator;

const QUEUE_GAP = 1.5;

@ccclass('ColorQueueControllers')
export class ColorQueueControllers extends Component implements IColorQueueControllers {
    
    _activeQueues: ColorQueue[] = []
    _colorQueues: ColorQueue[] = [];

    _levelController: ILevelController = null;

    protected onLoad(): void
    {
        this._colorQueues = this.node.getComponentsInChildren(ColorQueue);  
    }

    init(shooterQueues: ShooterQueue[], levelController: ILevelController): void 
    {
        this._activeQueues = [];
        this._levelController = levelController;
        
        for (let i = 0; i < this._colorQueues.length; i++)
        {
            const queueData = shooterQueues[ i ];
            const queue = this._colorQueues[i];
            queue.node.active = i < shooterQueues.length;
            if (i < shooterQueues.length) {
                this._activeQueues.push( queue );
            }
        }
        
        // align queues so they are centered
        const offsetX = -((this._activeQueues.length - 1) * QUEUE_GAP) / 2;
        for (let i = 0; i < this._activeQueues.length; i++)
        {
            const queue = this._activeQueues[i];
            queue.node.setPosition(i * QUEUE_GAP + offsetX, 0, 0);
            queue.init( shooterQueues[i].shooters, this._levelController );
        }
    }

    getRemainInQueueCount(): number 
    {
        let count = 0;
        for (let i = 0; i < this._activeQueues.length; i++)
        {
            const queue = this._activeQueues[i];
            count += queue.getRemainCount();
        }
        return count;
    }

    public clearQueue(): void
    {
        for (let i = 0; i < this._colorQueues.length; i++)
        {
            const queue = this._colorQueues[i];
            queue.node.destroyAllChildren();   
            queue.node.setPosition(0, 0, 0);
            queue.stopRolling();
        }
    }

    private index = 0;

    doUpdate(dt: number): void {
        for (this.index = 0; this.index < this._activeQueues.length; this.index++) {
            this._activeQueues[this.index].doUpdate(dt);
        }
    }
    
    public getQueueTopPosition(index: number): Vec3
    {
        return this._activeQueues[index].node.getWorldPosition();
    }
}


