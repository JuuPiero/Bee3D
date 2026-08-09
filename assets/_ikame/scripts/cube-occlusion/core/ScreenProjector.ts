import {
    Camera,
    Vec3,
} from 'cc';

export class ScreenProjector {
    private readonly _cameraPosition = new Vec3();
    private readonly _cameraForward = new Vec3();
    private readonly _cameraToPoint = new Vec3();

    /**
     * Call once before projecting a batch of points.
     *
     * This caches the camera position and forward direction
     * so we don't recalculate them for every sample.
     */
    public prepare(camera: Camera): void {
        this._cameraPosition.set(camera.node.worldPosition);

        Vec3.transformQuat(
            this._cameraForward,
            Vec3.FORWARD,
            camera.node.worldRotation,
        );
    }

    /**
     * Projects a world-space position into screen space.
     *
     * out.x = screen X
     * out.y = screen Y
     * out.z = our camera-forward depth
     */
    public project(
        camera: Camera,
        worldPosition: Readonly<Vec3>,
        out: Vec3,
    ): Vec3 {
        camera.worldToScreen(
            worldPosition,
            out,
        );

        Vec3.subtract(
            this._cameraToPoint,
            worldPosition,
            this._cameraPosition,
        );

        out.z = Vec3.dot(
            this._cameraToPoint,
            this._cameraForward,
        );

        return out;
    }

    /**
     * A positive depth means the point is in front
     * of the camera.
     */
    public isInFront(depth: number): boolean {
        return depth > 0;
    }
}