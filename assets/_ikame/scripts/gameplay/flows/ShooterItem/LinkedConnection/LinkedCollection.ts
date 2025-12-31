import { _decorator, Component, Node, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('LinkedConnection')
export class LinkedConnection extends Component {     
    @property(Node)
    public centerRotationNode: Node;

    @property(Node)
    public wireNode: Node;

    @property(Node)
    public targetNode: Node;

    private _dir = new Vec3();
    private _distance : number = 0;

    protected lateUpdate(dt: number): void
    {
        if (!this.targetNode)
            return;

        Vec3.subtract(this._dir, this.targetNode.worldPosition, this.centerRotationNode.worldPosition);
        Vec3.multiplyScalar(this._dir, this._dir, -1);
        Vec3.normalize(this._dir, this._dir);
        this.centerRotationNode.forward = this._dir;

        this._distance = Vec3.distance(this.centerRotationNode.worldPosition, this.targetNode.worldPosition) * 0.5;
        this.wireNode.setWorldScale(0.5, 0.5, this._distance);
    }

    public setTargetNode(target: Node): void
    {
        this.targetNode = target;
    }
}


