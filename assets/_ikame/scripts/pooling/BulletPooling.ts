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

    // Everything handed out and not yet given back, i.e. what is in the air right now. A set rather
    // than a counter so a double returnBullet() on the same node cannot drive the tally below the
    // truth - the end-of-level wait reads this, and a tally that never reaches zero would hold the
    // end panel back forever.
    private readonly _inFlight = new Set<Node>();

    public getBullet(): Node
    {
        if (this._pool.isEmpty())
        {
            const newBullet = instantiate(this.bulletPrefab);
            newBullet.setParent(this.node);
            this._inFlight.add(newBullet);
            return newBullet;
        }
        const bullet = this._pool.dequeue();
        bullet.active = true;
        this._inFlight.add(bullet);
        return bullet;
    }

    public returnBullet(bullet: Node): void
    {
        if (!this._inFlight.delete(bullet)) return;

        bullet.active = false;
        this._pool.enqueue(bullet);
    }

    /** How many bullets are out of the pool and still flying. */
    public getInFlightCount(): number
    {
        this.dropDestroyedInFlight();
        return this._inFlight.size;
    }

    /** Whether any bullet is still out of the pool. */
    public hasInFlightBullets(): boolean
    {
        return this.getInFlightCount() > 0;
    }

    /**
     * Forgets bullets whose node has been destroyed under them (a level torn down mid-flight). They
     * can never be returned, so left in they would report as forever-in-flight.
     */
    private dropDestroyedInFlight(): void
    {
        for (const bullet of this._inFlight)
        {
            if (!bullet.isValid) this._inFlight.delete(bullet);
        }
    }
}


