import { Vec3 } from 'cc';

/**
 * One screen-space triangle from a cube's occlusion box, projected for the current frame.
 * x/y = screen position, z = camera-forward depth (same convention as ScreenProjector.project).
 *
 * Testing against actual triangles (12 per box) rather than one axis-aligned bounding rect
 * avoids the false-block bug a rect test has: in an angled/isometric view a box's true screen
 * silhouette is a hexagon/diamond smaller than its bounding rect, and using one "nearest
 * corner" depth for that whole rect wrongly blocks samples the real geometry never covers.
 */
export class ProjectedTriangle
{
    public readonly p0 = new Vec3();
    public readonly p1 = new Vec3();
    public readonly p2 = new Vec3();

    public set(p0: Readonly<Vec3>, p1: Readonly<Vec3>, p2: Readonly<Vec3>): void
    {
        this.p0.set(p0);
        this.p1.set(p1);
        this.p2.set(p2);
    }
}
