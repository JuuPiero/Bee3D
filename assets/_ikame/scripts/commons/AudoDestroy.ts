import { _decorator, Component, director, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('AudoDestroy')
export class AudoDestroy extends Component {
    
    protected onEnable(): void
    {
        const scene = director.getScene();
        this.node.setParent(scene, true);
        this.scheduleOnce(() => {
            this.node.destroy();
        }, 3);
    }
}


