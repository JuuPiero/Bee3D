import { Vec3 } from 'cc';

// Barycentric slack, so floating-point error at the shared edge between two adjacent triangles
// never leaves a gap a sample can slip through.
const EDGE_TOLERANCE = -1e-4;

/**
 * One screen-space triangle from a cube's occlusion box, projected for the current pass.
 * x/y = screen position, z = camera-forward depth (same convention as ScreenProjector.project).
 *
 * Testing against actual triangles rather than one axis-aligned bounding rect avoids the
 * false-block bug a rect test has: in an angled/isometric view a box's true screen silhouette is
 * a hexagon/diamond smaller than its bounding rect, and using one "nearest corner" depth for that
 * whole rect wrongly blocks samples the real geometry never covers.
 *
 * set() precomputes everything that depends only on the triangle - screen bounds, nearest depth,
 * the barycentric coefficients - because each triangle is built once per pass and then tested
 * against many samples. blocks() is what runs in the hot loop: three early rejects, then a
 * handful of multiplies with no division.
 */
export class ProjectedTriangle
{
    public readonly p0 = new Vec3();
    public readonly p1 = new Vec3();
    public readonly p2 = new Vec3();

    /**
     * Index (into LevelGrid3D's solid-tile list) of the tile this triangle came from, so a tile's
     * visibility check can skip its own box and never self-occlude. Replaces the old
     * exclude-[start, end) slice: once triangles are bucketed by screen position they are no
     * longer visited in tile order, so a range no longer identifies an owner.
     */
    public ownerIndex: number = -1;

    /** Screen-space bounds - used by the bucket grid, and as the cheapest possible reject. */
    public minX: number = 0;
    public minY: number = 0;
    public maxX: number = 0;
    public maxY: number = 0;

    /** Nearest of the three corner depths: no point on this triangle is closer than this. */
    public nearestDepth: number = 0;

    /** True for an edge-on triangle, which can never cover a sample. */
    public degenerate: boolean = false;

    // Barycentric weights as an affine map of (x - p0.x, y - p0.y), with 1/denom folded in.
    private _a11: number = 0;
    private _a12: number = 0;
    private _a21: number = 0;
    private _a22: number = 0;

    // Depth deltas from p0, for the interpolated depth at a covered point.
    private _dz1: number = 0;
    private _dz2: number = 0;

    public set(p0: Readonly<Vec3>, p1: Readonly<Vec3>, p2: Readonly<Vec3>, ownerIndex: number): void
    {
        this.p0.set(p0);
        this.p1.set(p1);
        this.p2.set(p2);
        this.ownerIndex = ownerIndex;

        const e1x = p1.x - p0.x, e1y = p1.y - p0.y;
        const e2x = p2.x - p0.x, e2y = p2.y - p0.y;

        const denom = e1x * e2y - e2x * e1y;
        this.degenerate = Math.abs(denom) < 1e-8;
        if (!this.degenerate)
        {
            const inv = 1 / denom;
            this._a11 = e2y * inv;
            this._a12 = -e2x * inv;
            this._a21 = -e1y * inv;
            this._a22 = e1x * inv;
        }

        this._dz1 = p1.z - p0.z;
        this._dz2 = p2.z - p0.z;

        this.minX = Math.min(p0.x, p1.x, p2.x);
        this.maxX = Math.max(p0.x, p1.x, p2.x);
        this.minY = Math.min(p0.y, p1.y, p2.y);
        this.maxY = Math.max(p0.y, p1.y, p2.y);
        this.nearestDepth = Math.min(p0.z, p1.z, p2.z);
    }

    /**
     * Whether this triangle covers screen point (x, y) *and* sits in front of depth `z` - i.e.
     * whether it hides a sample there. Screen bounds and nearest depth are checked before the
     * barycentric math, since almost every tested triangle fails one of those.
     */
    public blocks(x: number, y: number, z: number, depthEpsilon: number): boolean
    {
        if (this.degenerate) return false;
        if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) return false;

        // Even this triangle's closest point is at or behind the sample: it cannot occlude it.
        if (this.nearestDepth + depthEpsilon >= z) return false;

        const dx = x - this.p0.x;
        const dy = y - this.p0.y;

        const w1 = dx * this._a11 + dy * this._a12;
        if (w1 < EDGE_TOLERANCE) return false;

        const w2 = dx * this._a21 + dy * this._a22;
        if (w2 < EDGE_TOLERANCE) return false;

        if (1 - w1 - w2 < EDGE_TOLERANCE) return false;

        const depth = this.p0.z + w1 * this._dz1 + w2 * this._dz2;
        return depth + depthEpsilon < z;
    }
}
