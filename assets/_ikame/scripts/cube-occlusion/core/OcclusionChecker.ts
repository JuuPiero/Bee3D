import {
    Camera,
    screen,
    Vec3,
} from 'cc';


import { ScreenProjector } from './ScreenProjector';
import { ProjectedTriangle } from './ProjectedTriangle';
import { SamplePoint } from '../data/SamplePoint';
import { OcclusionTarget } from '../component/OcclusionTarget';
import { VisibilityResult } from '../data/VisibilityResult';

export class OcclusionChecker {
    /**
     * Small tolerance for depth comparisons.
     */
    public depthEpsilon: number = 0.1;

    /**
     * Small tolerance for face-facing checks.
     */
    public facingEpsilon: number = 0.3;

    // Temporary vectors reused every check.
    private readonly _worldPosition = new Vec3();
    private readonly _screenPosition = new Vec3();

    private readonly _worldNormal = new Vec3();

    private readonly _localFaceCenter = new Vec3();
    private readonly _worldFaceCenter = new Vec3();

    private readonly _directionToCamera = new Vec3();

    /**
     * Calculate visibility for one target.
     *
     * projectedOccluders are ProjectedTriangles that
     * should already have been calculated once for
     * this frame.
     *
     * collectSamples should normally be false.
     * Enable it only when debugging.
     */
    public check(
        camera: Camera,
        projector: ScreenProjector,
        target: OcclusionTarget,
        projectedOccluders: readonly ProjectedTriangle[],
        collectSamples: boolean = false,
    ): VisibilityResult {

        const result =
            target.visibilityResult;

        result.reset();

        const worldMatrix =
            target.node.worldMatrix;

        const worldRotation =
            target.node.worldRotation;

        for (const face of target.faceSamples) {

            /**
             * Back-facing faces do not count.
             */
            if (
                !this.isFaceFacingCamera(
                    camera,
                    target,
                    face.normal,
                    worldMatrix,
                    worldRotation,
                )
            ) {
                continue;
            }

            /**
             * Only samples belonging to camera-facing
             * faces participate in totalSamples.
             */
            for (const localSample of face.samples) {

                result.totalSamples++;

                /**
                 * Local sample
                 *     ↓
                 * World position
                 */
                Vec3.transformMat4(
                    this._worldPosition,
                    localSample,
                    worldMatrix,
                );

                /**
                 * World position
                 *     ↓
                 * Screen position + depth
                 */
                projector.project(
                    camera,
                    this._worldPosition,
                    this._screenPosition,
                );

                let visible = true;

                const depth =
                    this._screenPosition.z;

                /**
                 * Behind camera / before near plane /
                 * beyond far plane.
                 */
                if (
                    depth < camera.near ||
                    depth > camera.far
                ) {
                    visible = false;
                }

                /**
                 * Outside the camera viewport.
                 */
                if (
                    visible &&
                    !this.isInsideCameraViewport(
                        camera,
                        this._screenPosition.x,
                        this._screenPosition.y,
                    )
                ) {
                    visible = false;
                }

                /**
                 * Check screen-space occlusion.
                 */
                if (visible) {
                    visible =
                        !this.isBlocked(
                            this._screenPosition,
                            projectedOccluders,
                        );
                }

                if (visible) {
                    result.visibleSamples++;
                }

                /**
                 * Only allocate SamplePoint objects
                 * when debugging is requested.
                 */
                if (collectSamples) {
                    const sample =
                        new SamplePoint();

                    sample.worldPosition.set(
                        this._worldPosition,
                    );

                    sample.screenPosition.set(
                        this._screenPosition,
                    );

                    sample.visible = visible;

                    result.samples.push(sample);
                }
            }
        }

        result.recalculate();

        return result;
    }

    /**
     * Determine whether this local box face
     * is pointing toward the camera.
     */
    private isFaceFacingCamera(
        camera: Camera,
        target: OcclusionTarget,
        localNormal: Readonly<Vec3>,
        worldMatrix: any,
        worldRotation: any,
    ): boolean {

        /**
         * Local normal → world normal.
         *
         * Rotation is sufficient for our oriented
         * box face normal.
         */
        Vec3.transformQuat(
            this._worldNormal,
            localNormal,
            worldRotation,
        );

        /**
         * Calculate this face's LOCAL center.
         */
        const halfX =
            Math.abs(target.size.x) * 0.5;

        const halfY =
            Math.abs(target.size.y) * 0.5;

        const halfZ =
            Math.abs(target.size.z) * 0.5;

        this._localFaceCenter.set(
            target.center.x +
            localNormal.x * halfX,

            target.center.y +
            localNormal.y * halfY,

            target.center.z +
            localNormal.z * halfZ,
        );

        /**
         * Local face center → world.
         */
        Vec3.transformMat4(
            this._worldFaceCenter,
            this._localFaceCenter,
            worldMatrix,
        );

        /**
         * Direction:
         *
         * face → camera
         */
        Vec3.subtract(
            this._directionToCamera,
            camera.node.worldPosition,
            this._worldFaceCenter,
        );

        /**
         * Positive dot means the face normal
         * points toward the camera.
         */
        return (
            Vec3.dot(
                this._worldNormal,
                this._directionToCamera,
            ) > this.facingEpsilon
        );
    }

    /**
     * Check whether a projected sample lies
     * inside the camera's viewport.
     */
    private isInsideCameraViewport(
        camera: Camera,
        x: number,
        y: number,
    ): boolean {

        const windowSize =
            screen.windowSize;

        const viewport =
            camera.rect;

        const minX =
            viewport.x * windowSize.width;

        const minY =
            viewport.y * windowSize.height;

        const maxX =
            (viewport.x + viewport.width) *
            windowSize.width;

        const maxY =
            (viewport.y + viewport.height) *
            windowSize.height;

        return (
            x >= minX &&
            x <= maxX &&
            y >= minY &&
            y <= maxY
        );
    }

    /**
     * Test one sample against all projected
     * occluder triangles.
     */
    private isBlocked(
        screenPosition: Readonly<Vec3>,
        projectedOccluders: readonly ProjectedTriangle[],
    ): boolean {

        for (const triangle of projectedOccluders) {

            const depth =
                this.getTriangleDepthAtPoint(
                    screenPosition.x,
                    screenPosition.y,
                    triangle,
                );

            /**
             * Sample is outside this triangle.
             */
            if (depth === null) {
                continue;
            }

            /**
             * Triangle overlaps the sample on screen.
             *
             * Now check whether the occluder surface
             * is closer.
             */
            if (
                depth + this.depthEpsilon <
                screenPosition.z
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Barycentric point-in-triangle test with
     * interpolated depth.
     *
     * Returns null when (x, y) is outside the triangle.
     */
    private getTriangleDepthAtPoint(
        x: number,
        y: number,
        triangle: ProjectedTriangle,
    ): number | null {

        const { p0, p1, p2 } = triangle;

        const denom =
            (p1.x - p0.x) * (p2.y - p0.y) -
            (p2.x - p0.x) * (p1.y - p0.y);

        /**
         * Degenerate (edge-on) triangle.
         */
        if (Math.abs(denom) < 1e-8) {
            return null;
        }

        const w1 =
            ((x - p0.x) * (p2.y - p0.y) -
            (p2.x - p0.x) * (y - p0.y)) / denom;

        const w2 =
            ((p1.x - p0.x) * (y - p0.y) -
            (x - p0.x) * (p1.y - p0.y)) / denom;

        const w0 = 1 - w1 - w2;

        /**
         * Small negative tolerance so samples that
         * fall exactly on a shared edge between two
         * adjacent triangles aren't dropped due to
         * floating point error.
         */
        const edgeTolerance = -1e-4;

        if (
            w0 < edgeTolerance ||
            w1 < edgeTolerance ||
            w2 < edgeTolerance
        ) {
            return null;
        }

        return (
            w0 * p0.z +
            w1 * p1.z +
            w2 * p2.z
        );
    }
}