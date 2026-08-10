import { Node, Quat, Vec3 } from 'cc';

// Movement below these is treated as "nothing moved". Positions are world units and rotations are
// quaternion components, so both are small absolute numbers by design.
const POSITION_EPSILON = 1e-4;
const ROTATION_EPSILON = 1e-5;

/**
 * The camera transform + cube-holder transform a pass was last computed against.
 *
 * Both occlusion and reachability are scored against the camera-facing faces, so their answers
 * change only when the camera moves or the map moves (or when a cube is removed, which the grid
 * signals separately). Comparing against a snapshot is what lets an idle frame skip the work
 * entirely instead of recomputing the same result.
 *
 * The holder's position and scale are watched alongside its rotation: rotation is what changes
 * every frame in play, but a holder that is moved or refitted shifts every cube on screen just as
 * much, and a missed change there would leave the whole map judged against where it used to be.
 */
export class ViewSnapshot
{
    private readonly _cameraPos = new Vec3();
    private readonly _cameraRot = new Quat();
    private readonly _holderPos = new Vec3();
    private readonly _holderRot = new Quat();
    private readonly _holderScale = new Vec3();

    // Scratch for the comparison, so hasChanged() allocates nothing.
    private readonly _rotScratch = new Quat();

    private _captured: boolean = false;

    public capture(cameraNode: Node, holder: Node): void
    {
        cameraNode.getWorldPosition(this._cameraPos);
        cameraNode.getWorldRotation(this._cameraRot);
        if (holder)
        {
            holder.getWorldPosition(this._holderPos);
            holder.getWorldRotation(this._holderRot);
            holder.getWorldScale(this._holderScale);
        }
        this._captured = true;
    }

    /** True until the first capture(), and afterwards whenever the camera or the map has moved. */
    public hasChanged(cameraNode: Node, holder: Node): boolean
    {
        if (!this._captured) return true;

        if (!ViewSnapshot.positionEquals(cameraNode.worldPosition, this._cameraPos)) return true;

        cameraNode.getWorldRotation(this._rotScratch);
        if (!ViewSnapshot.rotationEquals(this._rotScratch, this._cameraRot)) return true;

        if (holder)
        {
            holder.getWorldRotation(this._rotScratch);
            if (!ViewSnapshot.rotationEquals(this._rotScratch, this._holderRot)) return true;

            if (!ViewSnapshot.positionEquals(holder.worldPosition, this._holderPos)) return true;
            if (!ViewSnapshot.positionEquals(holder.worldScale, this._holderScale)) return true;
        }

        return false;
    }

    /** Forces the next hasChanged() to report a change. */
    public invalidate(): void
    {
        this._captured = false;
    }

    private static positionEquals(a: Readonly<Vec3>, b: Readonly<Vec3>): boolean
    {
        return Math.abs(a.x - b.x) <= POSITION_EPSILON
            && Math.abs(a.y - b.y) <= POSITION_EPSILON
            && Math.abs(a.z - b.z) <= POSITION_EPSILON;
    }

    private static rotationEquals(a: Readonly<Quat>, b: Readonly<Quat>): boolean
    {
        return Math.abs(a.x - b.x) <= ROTATION_EPSILON
            && Math.abs(a.y - b.y) <= ROTATION_EPSILON
            && Math.abs(a.z - b.z) <= ROTATION_EPSILON
            && Math.abs(a.w - b.w) <= ROTATION_EPSILON;
    }
}
