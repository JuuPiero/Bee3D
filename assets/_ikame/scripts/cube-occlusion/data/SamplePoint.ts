import { Vec3 } from 'cc';

/**
 * Represents one point sampled from the surface
 * of an OcclusionTarget.
 */
export class SamplePoint {
    /**
     * Position of this sample in world space.
     */
    public worldPosition: Vec3 = new Vec3();

    /**
     * Projected screen position.
     *
     * x = screen X
     * y = screen Y
     * z = projected depth
     */
    public screenPosition: Vec3 = new Vec3();

    /**
     * Whether this sample is visible from the camera.
     */
    public visible: boolean = true;

    constructor(worldPosition?: Vec3) {
        if (worldPosition) {
            this.worldPosition.set(worldPosition);
        }
    }

    /**
     * Reset the runtime state before performing
     * another visibility check.
     */
    public reset(): void {
        this.visible = true;
    }
}