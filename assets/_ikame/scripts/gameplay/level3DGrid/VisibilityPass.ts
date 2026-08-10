import { Camera, Quat, screen } from 'cc';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { ScreenTriangleGrid } from './ScreenTriangleGrid';

/**
 * Everything one occlusion pass shares across every tile it visits: the camera, the prepared
 * projector, the bucketed occluders, and the viewport rect in pixels.
 *
 * It exists so GridTile3D.computeVisibility() takes one argument instead of seven, and so the
 * values that used to be re-read per *sample* (screen.windowSize, camera.rect, camera.near/far)
 * are read once per pass.
 */
export class VisibilityPass
{
    public camera: Camera = null;
    public projector: ScreenProjector = null;
    public occluders: ScreenTriangleGrid = null;

    /**
     * The cube holder's world rotation at the moment this pass's occluders were projected.
     *
     * Frozen rather than read live per tile because the map rotates continuously: a pass spread
     * over several frames (visibilityTilesPerFrame) must place its samples in the same frame's
     * rotation as the triangles it tests them against, or a sample is checked against an occluder
     * that has since swung aside. Every tile shares the holder, so one copy covers the whole pass.
     */
    public readonly holderRotation = new Quat();

    /** Viewport bounds in pixels - a sample outside these is not visible. */
    public viewportMinX: number = 0;
    public viewportMinY: number = 0;
    public viewportMaxX: number = 0;
    public viewportMaxY: number = 0;

    public near: number = 0;
    public far: number = 0;

    /**
     * A tile stops sampling as soon as it has more than this many visible samples, because that
     * is already the whole question isTileVisible() asks. Set it to the caller's hide threshold.
     */
    public visibleSampleThreshold: number = 0;

    /**
     * Set when the caller needs the exact visibility *ratio* rather than just "visible or not".
     * Disables the early exit above, so visibleSamples/totalSamples are complete.
     */
    public exactCounts: boolean = false;

    /** Caches the per-pass camera/viewport values. Call once, before visiting any tile. */
    public prepare(camera: Camera, projector: ScreenProjector, occluders: ScreenTriangleGrid, holderRotation: Readonly<Quat>, visibleSampleThreshold: number, exactCounts: boolean): void
    {
        this.camera = camera;
        this.projector = projector;
        this.occluders = occluders;
        this.visibleSampleThreshold = visibleSampleThreshold;
        this.exactCounts = exactCounts;

        Quat.copy(this.holderRotation, holderRotation);

        this.near = camera.near;
        this.far = camera.far;

        const windowSize = screen.windowSize;
        const viewport = camera.rect;
        this.viewportMinX = viewport.x * windowSize.width;
        this.viewportMinY = viewport.y * windowSize.height;
        this.viewportMaxX = (viewport.x + viewport.width) * windowSize.width;
        this.viewportMaxY = (viewport.y + viewport.height) * windowSize.height;
    }
}
