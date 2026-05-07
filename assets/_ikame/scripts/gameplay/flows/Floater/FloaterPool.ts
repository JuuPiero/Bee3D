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
        for (let i = 0; i < this._showCount; i++)
        {
            const floater = this._floaters[i];
            this._queue.enqueue(floater);
        }
    }

    public getFloaterOut(): Node 
    {
        if (this._queue.isEmpty())
        {
            console.warn("FloaterPool: No floaters available in the pool.");
            return null;
        }
        const floater = this._queue.dequeue();
        return floater;
    }

    public returnFloater(floater: Node): void
    {
        floater.setWorldPosition(this.returnPos.getWorldPosition());
        this._queue.enqueue(floater);
    }

    public isCanGetFloater(): boolean
    {
        return !this._queue.isEmpty();
    }

    public getAvailableCount(): number
    {
        return this._queue.size();
    }
}
