import { _decorator, Component, Node, Prefab, Vec3 } from 'cc';
import { IColorQueueControllers } from './IColorQueueControllers';
import { ColorQueue } from './ColorQueue';
import { ShooterSpawnData3D } from '../../configData/LevelData3D';
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

    /**
     * @param shooterLines One entry per conveyor line, each already sorted by shooter index -
     *                     i.e. exactly what LevelData3D.getShootersByLine() returns. Lines beyond
     *                     the number of ColorQueue children in the scene are dropped with a warning,
     *                     since there is no queue to spawn them into.
     */
    init(shooterLines: ShooterSpawnData3D[][], levelController: ILevelController): void
    {
        this._activeQueues = [];
        this._levelController = levelController;

        // The level data is authoritative about how many lines exist, but the scene is
        // authoritative about how many queues can render them - take the smaller of the two.
        const lineCount = Math.min(shooterLines.length, this._colorQueues.length);
        if (shooterLines.length > this._colorQueues.length)
        {
            console.warn(`[ColorQueueControllers] Level has ${shooterLines.length} shooter lines but only ${this._colorQueues.length} ColorQueue children - the extra lines are not spawned.`);
        }

        for (let i = 0; i < this._colorQueues.length; i++)
        {
            const queue = this._colorQueues[i];
            queue.node.active = i < lineCount;
            if (i < lineCount) {
                this._activeQueues.push( queue );
            }
        }

        // align queues so they are centered
        const offsetX = -((this._activeQueues.length - 1) * QUEUE_GAP) / 2;
        for (let i = 0; i < this._activeQueues.length; i++)
        {
            const queue = this._activeQueues[i];
            queue.node.setPosition(i * QUEUE_GAP + offsetX, 0, 0);
            queue.init( shooterLines[i], this._levelController );
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


