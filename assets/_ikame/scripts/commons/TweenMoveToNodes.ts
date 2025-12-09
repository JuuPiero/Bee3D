import { _decorator, CCFloat, CCString, Component, Node, tween, easing, Tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TweenBetweenNodes')
export class TweenBetweenNodes extends Component {
    
    @property(Node)
    p1: Node

    @property(Node)
    p2: Node

    @property(CCFloat)
    duration: number = 1

    protected onEnable(): void
    {
        this.playTween();
    }

    playTween(): void
    {
        this.node.setPosition(this.p1.position);
        const t = tween(this.node)
            .to(this.duration, { position: this.p2.position }, { easing: easing.sineInOut })
            .to(this.duration, { position: this.p1.position }, { easing: easing.sineIn })
            .delay(1.2)
            tween(this.node).repeatForever(t).start();
    }

    protected onDisable(): void
    {
        Tween.stopAllByTarget(this.node);
    }
}


