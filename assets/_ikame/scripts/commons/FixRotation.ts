import { _decorator, Component, Node, Vec2, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('FixRotation')
export class FixRotation extends Component
{
    @property(Vec3)
    public rot : Vec3 = new Vec3(0,0,0);
        
    protected update(): void
    {
        this.node.setWorldRotationFromEuler(this.rot.x, this.rot.y, this.rot.z);
    }
}


