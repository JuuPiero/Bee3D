import {
    _decorator,
    Camera,
    Color,
    Component,
} from 'cc';
import { OcclusionTarget } from '../component/OcclusionTarget';


const {
    ccclass,
    property,
} = _decorator;

@ccclass('OcclusionDebug')
export class OcclusionDebug extends Component {

    @property(Camera)
    public camera: Camera | null = null;

    @property(OcclusionTarget)
    public target: OcclusionTarget | null = null;

    @property({
        min: 0.001,
    })
    public pointRadius: number = 0.03;

    protected start(): void {
        this.camera?.camera?.initGeometryRenderer();
    }

    protected lateUpdate(): void {
        if (!this.camera || !this.target) {
            return;
        }

        const renderer =
            this.camera.camera?.geometryRenderer;

        if (!renderer) {
            return;
        }

        const result =
            this.target.visibilityResult;

        for (const sample of result.samples) {

            renderer.addCross(
                sample.worldPosition,
                this.pointRadius,
                sample.visible
                    ? Color.GREEN
                    : Color.RED,
                true,
            );
        }
    }
}