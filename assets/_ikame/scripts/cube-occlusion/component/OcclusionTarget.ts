import {
    _decorator,
    Component,
    geometry,
    Vec3,
} from 'cc';
import { FaceSamples, CubeFaceSampler } from '../core/CubeFaceSampler';
import { VisibilityResult } from '../data/VisibilityResult';



const {
    ccclass,
    property,
} = _decorator;

@ccclass('OcclusionTarget')
export class OcclusionTarget extends Component {

    @property(Vec3)
    public center: Vec3 = new Vec3();

    @property(Vec3)
    public size: Vec3 =
        new Vec3(1, 1, 1);

    /**
     * Number of samples along each axis
     * of each face.
     */
    @property({
        min: 1,
        max: 10,
        step: 1,
    })
    public sampleGridSize: number = 3;

    /**
     * Normalized inset from the edges.
     *
     * Recommended:
     * 0.05 - 0.15
     *
     * Default:
     * 0.1 = 10%
     */
    @property({
        min: 0,
        max: 0.45,
        step: 0.01,
    })
    public sampleMargin: number = 0.1;

    private readonly _localBounds =
        new geometry.AABB();

    private _faceSamples: FaceSamples[] = [];

    private _visibilityResult =
        new VisibilityResult();

    protected onLoad(): void {
        this.rebuildSamples();
    }

    public get faceSamples():
        readonly FaceSamples[] {

        return this._faceSamples;
    }

    public get visibilityResult():
        VisibilityResult {

        return this._visibilityResult;
    }

    public get visibility(): number {
        return this._visibilityResult.visibility;
    }

    /**
     * Rebuild cached local samples.
     *
     * Needed after changing:
     *
     * center
     * size
     * sampleGridSize
     * sampleMargin
     */
    public rebuildSamples(): void {

        const halfX =
            Math.abs(this.size.x) * 0.5;

        const halfY =
            Math.abs(this.size.y) * 0.5;

        const halfZ =
            Math.abs(this.size.z) * 0.5;

        this._localBounds.center.set(
            this.center.x,
            this.center.y,
            this.center.z,
        );

        this._localBounds.halfExtents.set(
            halfX,
            halfY,
            halfZ,
        );

        this._faceSamples =
            CubeFaceSampler.generate(
                this._localBounds,
                this.sampleGridSize,
                this.sampleMargin,
            );
    }

    public setVisibilityResult(
        result: VisibilityResult,
    ): void {

        this._visibilityResult = result;
    }
}