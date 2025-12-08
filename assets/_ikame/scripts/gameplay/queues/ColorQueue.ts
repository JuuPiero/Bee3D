import { _decorator, Component, instantiate, Node, NodeSpace, Prefab, Vec3 } from 'cc';
import { Shooter } from '../../configData/LevelData';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { IColorQueue } from './IColorQueue';
import { ILevelController } from '../controllers/ILevelController';
import { Queue } from '../../commons/Queue';
const { ccclass, property } = _decorator;

const QUEUE_GAP = 2;
const TRANSLATE_SPEED = 2;

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

    private _shooterQueue: Queue<ShooterItem> = new Queue<ShooterItem>();

    init(shooters: Shooter[], levelController: ILevelController): void
    {
        this._shooterQueue.clear();
        for (let i = 0; i < shooters.length; i++)
        {
            const shooterData = shooters[i];
            const shooterNode = instantiate(this.shooterPrefab);
            const shooterComp = shooterNode.getComponent(ShooterItem);
            this.node.addChild(shooterNode);
            shooterNode.setPosition(0, 0, i * QUEUE_GAP);
            this._levelController = levelController;
            shooterComp.init(shooterData, this, this._levelController);
            this._shooterQueue.enqueue(shooterComp);
        }

        this._inititalSize = this.node.children.length * QUEUE_GAP;
        this.updateTargetZ();
    }

    private updateTargetZ(): void 
    {
        this._wholeSize = this.node.children.length * QUEUE_GAP;
        this._targetZ = this._wholeSize - this._inititalSize;
    }

    protected update(dt: number): void
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
}


