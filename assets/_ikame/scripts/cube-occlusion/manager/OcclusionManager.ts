import {
    _decorator,
    Camera,
    Component,
} from 'cc';
import { Occluder } from '../component/Occluder';
import { OcclusionTarget } from '../component/OcclusionTarget';
import { BoundsProjector } from '../core/BoundsProjector';
import { OcclusionChecker } from '../core/OcclusionChecker';
import { ScreenProjector } from '../core/ScreenProjector';
import { ProjectedTriangle } from '../core/ProjectedTriangle';
import { VisibilityResult } from '../data/VisibilityResult';



const {
    ccclass,
    property,
} = _decorator;

@ccclass('OcclusionManager')
export class OcclusionManager extends Component {

    /**
     * Camera used for visibility checks.
     */
    @property(Camera)
    public camera: Camera | null = null;

    /**
     * How often visibility should be recalculated.
     *
     * 0 = every frame
     * 0.1 = 10 times / second
     * 0.2 = 5 times / second
     * less then 0 = never automatically recalculate (manual only)
     */
    @property({
        min: -1,
    })
    public updateInterval: number = 0;

    /**
     * Store individual SamplePoint results.
     *
     * Keep this false during normal gameplay.
     */
    @property
    public collectDebugSamples: boolean = false;

    private readonly _targets: OcclusionTarget[] = [];
    private readonly _occluders: Occluder[] = [];

    /**
     * Occluder triangles projected for the
     * current visibility update.
     */
    private readonly _projectedTriangles: ProjectedTriangle[] = [];

    /**
     * Pool so we don't create new ProjectedTriangles
     * every frame.
     */
    private readonly _trianglePool: ProjectedTriangle[] = [];

    private readonly _screenProjector =
        new ScreenProjector();

    private readonly _boundsProjector =
        new BoundsProjector();

    private readonly _checker =
        new OcclusionChecker();

    private _elapsed: number = 0;

    /**
     * Register a target with this manager.
     */
    public registerTarget(
        target: OcclusionTarget,
    ): void {
        if (this._targets.indexOf(target) !== -1) {
            return;
        }

        this._targets.push(target);
    }

    /**
     * Remove a target.
     */
    public unregisterTarget(
        target: OcclusionTarget,
    ): void {
        const index =
            this._targets.indexOf(target);

        if (index === -1) {
            return;
        }

        this._targets.splice(index, 1);
    }

    /**
     * Register an occluder.
     */
    public registerOccluder(
        occluder: Occluder,
    ): void {
        if (this._occluders.indexOf(occluder) !== -1) {
            return;
        }

        this._occluders.push(occluder);
    }

    /**
     * Remove an occluder.
     */
    public unregisterOccluder(
        occluder: Occluder,
    ): void {
        const index =
            this._occluders.indexOf(occluder);

        if (index === -1) {
            return;
        }

        this._occluders.splice(index, 1);
    }

    protected update(
        deltaTime: number,
    ): void {

        if (!this.camera || this.updateInterval < 0) {
            return;
        }

        /**
         * Optional throttling.
         */
        if (this.updateInterval > 0) {
            this._elapsed += deltaTime;

            if (
                this._elapsed <
                this.updateInterval
            ) {
                return;
            }

            this._elapsed = 0;
        }

        this.runVisibilityCheck();
    }

    /**
     * Immediately recalculate visibility.
     *
     * Can also be called manually if desired.
     */
    public runVisibilityCheck(): void {
        const camera = this.camera;

        if (!camera) {
            return;
        }

        /**
         * Cache camera position / direction.
         */
        this._screenProjector.prepare(camera);

        /**
         * Step 1:
         * Project every occluder ONCE.
         */
        this.projectOccluders(camera);

        /**
         * Step 2:
         * Test every target against those
         * projected triangles.
         */
        this.checkTargets(camera);
    }

    private projectOccluders(
        camera: Camera,
    ): void {

        this._projectedTriangles.length = 0;

        let poolIndex = 0;

        for (const occluder of this._occluders) {

            if (!occluder.isValidOccluder) {
                continue;
            }

            poolIndex =
                this._boundsProjector.project(
                    camera,
                    this._screenProjector,
                    occluder.node,
                    occluder.center,
                    occluder.size,
                    this._trianglePool,
                    poolIndex,
                    this._projectedTriangles,
                );
        }
    }

    private checkTargets(
        camera: Camera,
    ): void {

        for (const target of this._targets) {

            if (
                !target.enabledInHierarchy ||
                !target.node.activeInHierarchy
            ) {
                continue;
            }

            this._checker.check(
                camera,
                this._screenProjector,
                target,
                this._projectedTriangles,
                this.collectDebugSamples,
            );
        }
    }

    public checkVisibility(
        target: OcclusionTarget,
        occluders: readonly Occluder[],
        collectSamples: boolean = false,
    ): VisibilityResult {

        const camera = this.camera;

        if (!camera) {
            const result = target.visibilityResult;
            result.reset();
            return result;
        }

        this._screenProjector.prepare(camera);

        this._projectedTriangles.length = 0;

        let poolIndex = 0;

        for (const occluder of occluders) {
            if (!occluder.isValidOccluder) {
                continue;
            }

            poolIndex =
                this._boundsProjector.project(
                    camera,
                    this._screenProjector,
                    occluder.node,
                    occluder.center,
                    occluder.size,
                    this._trianglePool,
                    poolIndex,
                    this._projectedTriangles,
                );
        }

        return this._checker.check(
            camera,
            this._screenProjector,
            target,
            this._projectedTriangles,

            // IMPORTANT
            collectSamples,
        );
    }
}