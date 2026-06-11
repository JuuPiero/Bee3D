import { _decorator, Component, instantiate, Node, NodeSpace, Prefab, Vec3 } from 'cc';
import { Shooter } from '../../configData/LevelData';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { IColorQueue } from './IColorQueue';
import { ILevelController } from '../controllers/ILevelController';
import { Queue } from '../../commons/Queue';
const { ccclass, property } = _decorator;

const QUEUE_GAP = 1.56;
const TRANSLATE_SPEED = 8;
const ACTIVE_QUEUE_LIMIT = 5;

@ccclass('ColorQueue')
export class ColorQueue extends Component implements IColorQueue {

    @property(Prefab)
    public shooterPrefab: Prefab = null;

    private _levelController: ILevelController;
    private _wholeSize: number;
    private _targetZ: number;
    private _inititalSize: number;
    private _isRolling: boolean = false;
    private _translateVector = new Vec3();

    public stopRolling(): void
    {
        this._isRolling = false;
    }

    private _shooterQueue: Queue<ShooterItem> = new Queue<ShooterItem>();
    private _allShooters: ShooterItem[] = [];
    private _activeCount: number = 0;

    init(shooters: Shooter[], levelController: ILevelController): void
    {
        this._shooterQueue.clear();
        this._allShooters = [];
        this._levelController = levelController;

        let posIndex = 0;
        for (let i = 0; i < shooters.length; i++)
        {
            const shooterData = shooters[ i ];
            if (shooterData.ammo <= 0) continue;
            const shooterNode = instantiate(this.shooterPrefab);
            const shooterComp = shooterNode.getComponent(ShooterItem);
            this.node.addChild(shooterNode);
            shooterNode.setPosition(0, 0, posIndex * QUEUE_GAP);
            shooterComp.init(shooterData, this, this._levelController);
            this._shooterQueue.enqueue(shooterComp);
            this._allShooters.push(shooterComp);
            posIndex++;
        }

        this._activeCount = Math.min(this._allShooters.length, ACTIVE_QUEUE_LIMIT);
        for (let i = ACTIVE_QUEUE_LIMIT; i < this._allShooters.length; i++)
        {
            this._allShooters[i].node.active = false;
        }

        this._inititalSize = this._shooterQueue.size() * QUEUE_GAP;
        this.updateTargetZ();
    }

    private updateTargetZ(): void 
    {
        this._wholeSize = this._shooterQueue.size() * QUEUE_GAP;
        this._targetZ = this._wholeSize - this._inititalSize;
    }

    doUpdate(dt: number): void
    {
        this.updateTargetZ();
        if (this.node.position.z <= this._targetZ)
        {
            this.node.setPosition(this.node.position.x, this.node.position.y, this._targetZ);
            this._isRolling = false;
            return;
        }
        this._isRolling = true;
        this._translateVector.set(0,  0, TRANSLATE_SPEED * -dt,);
        this.node.translate(this._translateVector, NodeSpace.LOCAL);
    }

    public isRolling(): boolean
    {
        return this._isRolling;
    }

    public isOnTop(shooter: ShooterItem): boolean
    {
        const topShooter = this._shooterQueue.peek();
        return topShooter === shooter;
    }

    public removeShooter(shooter: ShooterItem): boolean
    {
        if (this.isOnTop(shooter))
        {
            this._shooterQueue.dequeue();
            if (this._activeCount < this._allShooters.length)
            {
                this._allShooters[this._activeCount].node.active = true;
                this._activeCount++;
            }
            return true;
        }
        return false;
    }

    public getRemainCount(): number 
    {
        return this._shooterQueue.size();
    }
}


