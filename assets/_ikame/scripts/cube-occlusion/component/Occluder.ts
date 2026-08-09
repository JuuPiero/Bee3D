import {
    _decorator,
    Component,
    Vec3,
} from 'cc';

const {
    ccclass,
    property,
} = _decorator;

@ccclass('Occluder')
export class Occluder extends Component {

    /**
     * Local-space center of the invisible
     * occlusion box.
     */
    @property(Vec3)
    public center: Vec3 = new Vec3();

    /**
     * Local-space size of the invisible
     * occlusion box.
     */
    @property(Vec3)
    public size: Vec3 = new Vec3(1, 1, 1);

    /**
     * Whether this component should currently
     * participate in occlusion checks.
     */
    public get isValidOccluder(): boolean {
        return (
            this.enabledInHierarchy &&
            this.node.activeInHierarchy &&
            this.size.x !== 0 &&
            this.size.y !== 0 &&
            this.size.z !== 0
        );
    }
}