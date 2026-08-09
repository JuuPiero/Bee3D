import { Vec3 } from 'cc';

/**
 * One screen-space triangle produced by projecting
 * an occluder box face.
 *
 * Each point:
 *
 * x = screen X
 * y = screen Y
 * z = camera-forward depth (see ScreenProjector.project)
 */
export class ProjectedTriangle {

    public readonly p0 = new Vec3();
    public readonly p1 = new Vec3();
    public readonly p2 = new Vec3();

    public set(
        p0: Readonly<Vec3>,
        p1: Readonly<Vec3>,
        p2: Readonly<Vec3>,
    ): void {
        this.p0.set(p0);
        this.p1.set(p1);
        this.p2.set(p2);
    }
}
