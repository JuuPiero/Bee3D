import { _decorator, Component, Label, Node, tween, Vec3 } from 'cc';
import { Queue } from '../../../commons/Queue';
const { ccclass, property } = _decorator;

const ROT = new Vec3(0, 0, -67.7);
const GAP = .23

@ccclass('FloaterPool')
export class FloaterPool extends Component {
   
    private _floaters: Node[] = [];
    private _queue: Queue<Node> = new Queue<Node>(); 
    
    private _showCount: number = 0;

    private _startPos = new Vec3();

    @property(Label ) countLabel: Label = null;
    
    @property(Node) holder: Node = null;
    @property(Node) returnPos: Node = null;

    protected onLoad(): void
    {
        this._floaters = this.holder.children;
    }

    init(showCount: number): void
    {
        this._showCount = showCount;
        this._queue = new Queue<Node>();
        for (let i = 0; i < this._floaters.length; i++)
        {
            this._floaters[i].active = false;
        }
        for (let i = 0; i < this._showCount; i++)
        {
            const floater = this._floaters[i];
            floater.active = true;
            this._queue.enqueue(floater);
        }
        this.updateView();
    }

    public getFloaterOut(): Node 
    {
        if (this._queue.isEmpty())
        {
            console.warn("FloaterPool: No floaters available in the pool.");
            return null;
        }
        const floater = this._queue.dequeue();
        this.updateView();
        return floater;
    }

    public returnFloater(floater: Node): void
    {
        floater.setWorldPosition(this.returnPos.getWorldPosition());
        this._queue.enqueue(floater);
        this.updateView();
    }

    private updateView(): void 
    {
        this.holder.getWorldPosition(this._startPos);
        for (let i = 0; i < this._queue.Items.length; i++)
        {
            const floater = this._queue.Items[i];
            const targetPos = new Vec3(this._startPos.x - (i * GAP), this._startPos.y, this._startPos.z);
            floater.setRotationFromEuler(ROT);
            tween(floater)
                .to(0.23, { worldPosition: targetPos })
                .start();
        }
        this.countLabel.string = `${this._queue.size()}/${this._showCount}`;
    }

    public isCanGetFloater(): boolean
    {
        return !this._queue.isEmpty();
    }
}
