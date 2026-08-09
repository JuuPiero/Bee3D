import { Camera, geometry, Mat4, Node, Quat, screen, Vec3 } from 'cc';
import { IGridTile3D } from './IGridTile3D';
import { ProjectedTriangle } from './ProjectedTriangle';
import { CubeFace, CubeFaceSampler, FaceSamples } from '../../cube-occlusion/core/CubeFaceSampler';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { VisibilityResult } from '../../cube-occlusion/data/VisibilityResult';

// Reused every check to avoid per-sample/per-corner allocations.
const _worldSampleScratch = new Vec3();
const _screenSampleScratch = new Vec3();
const _directionScratch = new Vec3();
const _rotatedVectorScratch = new Vec3();
const _localCornerScratch = new Vec3();
const _cornerScratch = new Vec3();
const _screenCorners: Vec3[] = Array.from({ length: 8 }, () => new Vec3());
const _cornerInFront: boolean[] = new Array(8).fill(false);

const FACING_EPSILON = 0.00001;
const DEPTH_EPSILON = 0.001;

// Corner index bit layout: bit0 = +X, bit1 = +Z, bit2 = +Y (0 = negative side).
// Two triangles per face, matching that layout.
const FACE_TRIANGLE_INDICES: readonly (readonly [number, number, number])[] = [
    [0, 1, 3], [0, 3, 2], // -Y
    [4, 5, 7], [4, 7, 6], // +Y
    [1, 3, 7], [1, 7, 5], // +X
    [0, 2, 6], [0, 6, 4], // -X
    [2, 3, 7], [2, 7, 6], // +Z
    [0, 1, 5], [0, 5, 4], // -Z
];

export class GridTile3D implements IGridTile3D
{
    // Shared by every tile: local-space face samples depend only on the (level-wide) cube
    // size, so they are generated once via configureOcclusion() instead of per tile.
    private static _faceSamplesByFace: Map<CubeFace, FaceSamples> = null;

    // Face -> neighbour-getter, matching the axis mapping documented on IGridTile3D.
    private static readonly FACE_NEIGHBORS: { face: CubeFace; getNeighbor: (tile: GridTile3D) => IGridTile3D }[] = [
        { face: CubeFace.PositiveY, getNeighbor: t => t._upLinkedTile },     // +Y
        { face: CubeFace.NegativeY, getNeighbor: t => t._downLinkedTile },  // -Y
        { face: CubeFace.NegativeZ, getNeighbor: t => t._topLinkedTile },   // -Z
        { face: CubeFace.PositiveZ, getNeighbor: t => t._bottomLinkedTile },// +Z
        { face: CubeFace.NegativeX, getNeighbor: t => t._leftLinkedTile },  // -X
        { face: CubeFace.PositiveX, getNeighbor: t => t._rightLinkedTile }, // +X
    ];

    private _coordX: number;
    private _coordY: number;
    private _coordZ: number;

    private _worldPos: Vec3 = null;
    private _localPos: Vec3 = null;

    private _colorID: number = -1;
    private _health: number = 0;

    private _upLinkedTile: IGridTile3D = null;
    private _downLinkedTile: IGridTile3D = null;
    private _topLinkedTile: IGridTile3D = null;
    private _bottomLinkedTile: IGridTile3D = null;
    private _leftLinkedTile: IGridTile3D = null;
    private _rightLinkedTile: IGridTile3D = null;

    private readonly _visibilityResult = new VisibilityResult();

    private _parentWorldMatrix = new Mat4();
    private _parentNode: Node;
    private readonly _worldRotation = new Quat();

    constructor(public xCoord: number, public yCoord: number, public zCoord: number, parent: Node, localPos: Vec3)
    {
        this._coordX = xCoord;
        this._coordY = yCoord;
        this._coordZ = zCoord;
        this._localPos = localPos;
        //#region Calculate world position
        this._parentNode = parent;
        this._worldPos = new Vec3();
        parent.getWorldMatrix(this._parentWorldMatrix);
        Vec3.transformMat4(this._worldPos, this._localPos, this._parentWorldMatrix);
        //#endregion
    }

    /**
     * Builds the shared local-space face samples used by every tile's computeVisibility().
     * Call once per level spawn (size/sampling is uniform across the grid).
     */
    public static configureOcclusion(size: Vec3, sampleGridSize: number, sampleMargin: number): void
    {
        const bounds = new geometry.AABB();
        bounds.center.set(0, 0, 0);
        bounds.halfExtents.set(Math.abs(size.x) * 0.5, Math.abs(size.y) * 0.5, Math.abs(size.z) * 0.5);

        const faceSamples = CubeFaceSampler.generate(bounds, sampleGridSize, sampleMargin);

        GridTile3D._faceSamplesByFace = new Map<CubeFace, FaceSamples>();
        for (const fs of faceSamples) GridTile3D._faceSamplesByFace.set(fs.face, fs);
    }

    /**
     * Projects an axis-aligned world-space box (a cube's occlusion bounds) into up to 12
     * screen-space triangles (2 per face), appending them to `outTriangles` and pulling from
     * `trianglePool` (grown lazily, reused across frames) starting at `poolIndex`. A triangle
     * is skipped entirely if any of its 3 corners is behind the camera - no near-plane
     * clipping. Returns the updated poolIndex.
     */
    public static projectOcclusionTriangles(camera: Camera, projector: ScreenProjector, worldCenter: Readonly<Vec3>, halfExtents: Readonly<Vec3>, rotation: Readonly<Quat>, trianglePool: ProjectedTriangle[], poolIndex: number, outTriangles: ProjectedTriangle[]): number
    {
        const hx = halfExtents.x, hy = halfExtents.y, hz = halfExtents.z;

        // Bit0 = +X, bit1 = +Z, bit2 = +Y - must match FACE_TRIANGLE_INDICES. The corner
        // offset is defined in the grid's local space, so it must be rotated by the holder's
        // world rotation before being added to the (already world-space) center.
        for (let corner = 0; corner < 8; corner++)
        {
            _localCornerScratch.set(
                (corner & 1) ? hx : -hx,
                (corner & 4) ? hy : -hy,
                (corner & 2) ? hz : -hz,
            );
            Vec3.transformQuat(_cornerScratch, _localCornerScratch, rotation);
            _cornerScratch.set(
                worldCenter.x + _cornerScratch.x,
                worldCenter.y + _cornerScratch.y,
                worldCenter.z + _cornerScratch.z,
            );

            projector.project(camera, _cornerScratch, _screenCorners[corner]);
            _cornerInFront[corner] = projector.isInFront(_screenCorners[corner].z);
        }

        for (const [a, b, c] of FACE_TRIANGLE_INDICES)
        {
            if (!_cornerInFront[a] || !_cornerInFront[b] || !_cornerInFront[c]) continue;

            let triangle = trianglePool[poolIndex];
            if (!triangle)
            {
                triangle = new ProjectedTriangle();
                trianglePool.push(triangle);
            }

            triangle.set(_screenCorners[a], _screenCorners[b], _screenCorners[c]);
            outTriangles.push(triangle);
            poolIndex++;
        }

        return poolIndex;
    }

    /**
     * Barycentric-interpolated depth of the triangle at screen position (x, y), or null if
     * the point falls outside the triangle (with a small tolerance so floating-point error
     * at a shared edge between two adjacent triangles never leaves a gap).
     */
    private static getTriangleDepthAtPoint(x: number, y: number, tri: ProjectedTriangle): number | null
    {
        const { p0, p1, p2 } = tri;

        const denom = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
        if (Math.abs(denom) < 1e-8) return null; // degenerate (edge-on) triangle

        const w1 = ((x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (y - p0.y)) / denom;
        const w2 = ((p1.x - p0.x) * (y - p0.y) - (x - p0.x) * (p1.y - p0.y)) / denom;
        const w0 = 1 - w1 - w2;

        const edgeTolerance = -1e-4;
        if (w0 < edgeTolerance || w1 < edgeTolerance || w2 < edgeTolerance) return null;

        return w0 * p0.z + w1 * p1.z + w2 * p2.z;
    }

    getCoordX(): number
    {
        return this._coordX;
    }

    getCoordY(): number
    {
        return this._coordY;
    }

    getCoordZ(): number
    {
        return this._coordZ;
    }

    getLocalPos(): Vec3
    {
        return this._localPos;
    }

    getWorldPos(): Vec3
    {
        this._parentNode.getWorldMatrix(this._parentWorldMatrix);
        Vec3.transformMat4(this._worldPos, this._localPos, this._parentWorldMatrix);
        return this._worldPos;
    }

    /**
     * The holder's current world rotation. Local-space vectors (face normals, sample
     * offsets, box corner offsets) must be rotated by this before being combined with
     * getWorldPos() - otherwise they silently assume the holder has no rotation.
     */
    getWorldRotation(): Quat
    {
        this._parentNode.getWorldRotation(this._worldRotation);
        return this._worldRotation;
    }

    setCubeData(colorID: number, health: number): void
    {
        this._colorID = colorID;
        this._health = health;
    }

    clearCubeData(): void
    {
        this._colorID = -1;
        this._health = 0;
    }

    isContainBlock(): boolean
    {
        return this._colorID !== -1;
    }

    isEmpty(): boolean
    {
        return !this.isContainBlock();
    }

    getColorID(): number
    {
        if (!this.isContainBlock()) return -1;
        return this._colorID;
    }

    getHealth(): number
    {
        return this._health;
    }

    isMatchingColorID(colorID: number): boolean
    {
        if (!this.isContainBlock()) return false;
        return this._colorID === colorID;
    }

    setLinkedTiles(
        up: IGridTile3D,
        down: IGridTile3D,
        top: IGridTile3D,
        bottom: IGridTile3D,
        left: IGridTile3D,
        right: IGridTile3D
    ): void
    {
        this._upLinkedTile = up;
        this._downLinkedTile = down;
        this._topLinkedTile = top;
        this._bottomLinkedTile = bottom;
        this._leftLinkedTile = left;
        this._rightLinkedTile = right;
    }

    getUpLinkedTile(): IGridTile3D
    {
        return this._upLinkedTile;
    }

    getDownLinkedTile(): IGridTile3D
    {
        return this._downLinkedTile;
    }

    getTopLinkedTile(): IGridTile3D
    {
        return this._topLinkedTile;
    }

    getBottomLinkedTile(): IGridTile3D
    {
        return this._bottomLinkedTile;
    }

    getLeftLinkedTile(): IGridTile3D
    {
        return this._leftLinkedTile;
    }

    getRightLinkedTile(): IGridTile3D
    {
        return this._rightLinkedTile;
    }

    /** True when every neighbour exists and holds a cube - this tile can never be seen. */
    isEnclosed(): boolean
    {
        for (const entry of GridTile3D.FACE_NEIGHBORS)
        {
            const neighbor = entry.getNeighbor(this);
            if (!neighbor || !neighbor.isContainBlock()) return false;
        }
        return true;
    }

    getVisibilityResult(): VisibilityResult
    {
        return this._visibilityResult;
    }

    /**
     * Camera-space visibility check for this tile. Faces sealed by a neighbouring cube are
     * skipped entirely (they can never contribute a visible sample), and fully-enclosed
     * tiles skip sampling altogether.
     */
    computeVisibility(camera: Camera, projector: ScreenProjector, triangles: readonly ProjectedTriangle[], excludeStart: number, excludeEnd: number): VisibilityResult
    {
        const result = this._visibilityResult;
        result.samples.length = 0;
        result.visibleSamples = 0;
        result.totalSamples = 0;

        const faceSamplesByFace = GridTile3D._faceSamplesByFace;

        if (!this.isContainBlock() || !faceSamplesByFace)
        {
            result.visibility = 0;
            return result;
        }

        const rotation = this.getWorldRotation();

        for (const entry of GridTile3D.FACE_NEIGHBORS)
        {
            const neighbor = entry.getNeighbor(this);
            if (neighbor && neighbor.isContainBlock()) continue; // sealed face, no need to sample it

            const faceSamples = faceSamplesByFace.get(entry.face);
            if (!faceSamples || !this.isFaceFacingCamera(camera, faceSamples.normal, rotation)) continue;

            for (const localSample of faceSamples.samples)
            {
                result.totalSamples++;
                const worldPos = this.getWorldPos();
                Vec3.transformQuat(_rotatedVectorScratch, localSample, rotation);
                _worldSampleScratch.set(
                    worldPos.x + _rotatedVectorScratch.x,
                    worldPos.y + _rotatedVectorScratch.y,
                    worldPos.z + _rotatedVectorScratch.z,
                );

                projector.project(camera, _worldSampleScratch, _screenSampleScratch);

                const depth = _screenSampleScratch.z;
                let visible = depth >= camera.near && depth <= camera.far;

                if (visible && !this.isInsideViewport(camera, _screenSampleScratch.x, _screenSampleScratch.y))
                {
                    visible = false;
                }

                if (visible && this.isBlocked(_screenSampleScratch, triangles, excludeStart, excludeEnd))
                {
                    visible = false;
                }

                if (visible) result.visibleSamples++;
            }
        }

        result.recalculate();
        return result;
    }

    private isFaceFacingCamera(camera: Camera, localNormal: Readonly<Vec3>, rotation: Readonly<Quat>): boolean
    {
        // Direction from this tile's center to the camera. Using the tile center (rather
        // than the exact face center) is a safe approximation since cubes are unscaled and
        // cameras sit well outside a single cube's half-extent. The face normal is defined
        // in the grid's local space, so it must be rotated by the holder's world rotation
        // before comparing against this world-space direction.
        const wPos = this.getWorldPos();
        Vec3.transformQuat(_rotatedVectorScratch, localNormal, rotation);

        _directionScratch.set(
            camera.node.worldPosition.x - wPos.x,
            camera.node.worldPosition.y - wPos.y,
            camera.node.worldPosition.z - wPos.z,
        );

        return Vec3.dot(_rotatedVectorScratch, _directionScratch) > FACING_EPSILON;
    }

    private isInsideViewport(camera: Camera, x: number, y: number): boolean
    {
        const windowSize = screen.windowSize;
        const viewport = camera.rect;

        const minX = viewport.x * windowSize.width;
        const minY = viewport.y * windowSize.height;
        const maxX = (viewport.x + viewport.width) * windowSize.width;
        const maxY = (viewport.y + viewport.height) * windowSize.height;

        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    private isBlocked(screenPosition: Readonly<Vec3>, triangles: readonly ProjectedTriangle[], excludeStart: number, excludeEnd: number): boolean
    {
        for (let i = 0; i < triangles.length; i++)
        {
            if (i >= excludeStart && i < excludeEnd) continue; // this tile's own triangles

            const depth = GridTile3D.getTriangleDepthAtPoint(screenPosition.x, screenPosition.y, triangles[i]);
            if (depth === null) continue;
            if (depth + DEPTH_EPSILON < screenPosition.z) return true;
        }
        return false;
    }
}
