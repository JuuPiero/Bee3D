import { _decorator, CCFloat, Component, Node, Vec3 } from 'cc';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { IShooterConvey } from './IShooterConvey';
const { ccclass, property } = _decorator;


@ccclass('ShooterConvey')
export class ShooterConvey extends Component implements IShooterConvey{
    @property(Node) private startNode: Node;
    @property(Node) private endNode: Node;
    private _speed : number;

    @property(CCFloat) private minCap: number;
    @property(CCFloat) private maxCap: number;

    private _slotProgressMap: Map<Node, number>;

    public init(shooters : ShooterItem[] , speedConey : number): void 
    {
        this._speed = speedConey;
        const progressGap = 1 / shooters.length;
        this._slotProgressMap = new Map();
        for (let i = 0; i < shooters.length; i++)
        {
            const p = i * progressGap;
            const wPos = new Vec3();
            Vec3.lerp(wPos, this.startNode.worldPosition, this.endNode.worldPosition, p)
            shooters[i].node.setWorldPosition(wPos);
            this._slotProgressMap.set(shooters[i].node, p);
        }
    }

    protected update(dt: number): void {
        if (!this._slotProgressMap) return;
        for (var [x, p] of this._slotProgressMap)
        {
            this.shooterMovement(dt, x);
        }
    }

    private shooterMovement(dt: number, node: Node): void 
    {
        const progress = this._slotProgressMap.get(node) + (dt * this._speed); 
        this._slotProgressMap.set(node, progress);
        Vec3.lerp(node.worldPosition, this.startNode, this.endNode, progress);

        const isOutOfBound = progress < this.minCap && progress > this.maxCap;
        if (isOutOfBound)
        {
            if (node.active) node.active = false; 
        }
        else 
        {
            if (node.active === false) node.active = true;
        }
    }   

    public removeShooter(shooterNode: Node): void 
    {
        this._slotProgressMap.delete(shooterNode);
    }
}


