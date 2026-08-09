import { _decorator, Component, EventMouse, Input, input, Node } from 'cc';
import { OcclusionManager } from '../manager/OcclusionManager';
import { OcclusionTarget } from '../component/OcclusionTarget';
import { Occluder } from '../component/Occluder';
const { ccclass, property } = _decorator;

@ccclass('Demo')
export class Demo extends Component {
    
    @property(OcclusionManager)
    public occlusionManager: OcclusionManager | null = null;

    @property(OcclusionTarget)
    public occlusionTarget: OcclusionTarget | null = null;

    @property([Occluder])
    public occluders: Occluder[] = [];

    start() {
        input.on(Input.EventType.MOUSE_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: EventMouse) {
        if (event.getButton() === EventMouse.BUTTON_LEFT) {
            const res = this.occlusionManager.checkVisibility(this.occlusionTarget, this.occluders, true);
            console.log(`Visibility: ${res.visibility}, Visible Samples: ${res.visibleSamples}, Total Samples: ${res.totalSamples}`);
        }
    }

    protected onDestroy(): void {
        input.off(Input.EventType.MOUSE_DOWN, this.onKeyDown, this);
    }
}


