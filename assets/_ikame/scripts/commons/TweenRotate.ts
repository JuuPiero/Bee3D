import { _decorator, CCFloat, Component, Node, tween, Tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TweenRotate')
export class TweenRotate extends Component {
        
    @property(Vec3)
    private euler1: Vec3 = new Vec3(0, 0, 0);
    @property(Vec3)
    private euler2: Vec3 = new Vec3(0, 0, 0);

    @property(CCFloat) duration: number = 0;

    protected onEnable(): void {
        
        Tween.stopAllByTarget(this.node);
        this.node.setRotationFromEuler(this.euler1);

        const t = tween(this.node)
            .to(this.duration, { eulerAngles: this.euler2 })
            .to(this.duration, { eulerAngles: this.euler1 })
            .start();
        tween(this.node).repeatForever(t).start();
    }

    protected onDisable(): void {
        Tween.stopAllByTarget(this.node);
    }
}


