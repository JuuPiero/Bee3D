import { _decorator, Component, instantiate, Node, Prefab } from 'cc';
import { Queue } from '../commons/Queue';
const { ccclass, property } = _decorator;

@ccclass('BulletPooling')
export class BulletPooling extends Component {
    
    private _pool: Queue<Node>;

    @property(Prefab)
    public bulletPrefab: Prefab = null;

    @property([Node])
    public initialBullets: Node[] = [];

    protected start(): void
    {
        this._pool = new Queue<Node>(this.initialBullets);
        for (let i = 0; i < this.initialBullets.length; i++)
        {
            this.initialBullets[i].active = false;
        }
    }

    public getBullet(): Node
    {
        if (this._pool.isEmpty())
        {
            const newBullet = instantiate(this.bulletPrefab);
            newBullet.setParent(this.node);
            return newBullet;
        }
        const bullet = this._pool.dequeue();
        bullet.active = true;
        return bullet;
    }

    public returnBullet(bullet: Node): void
    {
        bullet.active = false;
        this._pool.enqueue(bullet);
    }
}


