import { _decorator, Component, Node, Prefab } from 'cc';
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

    getRemainCount(): number 
    {
        let count = 0;
        for (let i = 0; i < this._activeQueues.length; i++)
        {
            const queue = this._activeQueues[i];
            count += queue.getRemainCount();
        }
        return count;
    }
}


