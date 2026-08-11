import { Camera, geometry, Mat4, Node, Quat, Vec3 } from 'cc';
import { IGridTile3D } from './IGridTile3D';
import { ProjectedTriangle } from './ProjectedTriangle';
import { CubeFace, CubeFaceSampler, FaceSamples } from '../../cube-occlusion/core/CubeFaceSampler';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { VisibilityResult } from '../../cube-occlusion/data/VisibilityResult';
import { VisibilityPass } from './VisibilityPass';

// Reused every check to avoid per-sample/per-corner allocations.
const _worldSampleScratch = new Vec3();
const _screenSampleScratch = new Vec3();
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

// FACE_TRIANGLE_INDICES' face order (-Y, +Y, +X, -X, +Z, -Z) expressed as indices into
// FACE_NEIGHBORS (+Y, -Y, -Z, +Z, -X, +X), so a box face can look up its already-rotated normal
// instead of rotating its own copy.
const BOX_FACE_TO_NEIGHBOR_INDEX: readonly number[] = [1, 0, 5, 4, 3, 2];

export class GridTile3D implements IGridTile3D
{
    // Shared by every tile: local-space face samples depend only on the (level-wide) cube size, so
    // they are generated once via configureOcclusion() instead of per tile. Stored index-aligned
    // with FACE_NEIGHBORS, so the hot loops index it instead of doing a Map lookup per face per
    // tile.
    private static _faceSamplesByIndex: FaceSamples[] = null;

    // Face -> neighbour-getter, matching the axis mapping documented on IGridTile3D. Typed on the
    // interface, so the corridor walks below can carry an IGridTile3D without downcasting at
    // every hop.
    private static readonly FACE_NEIGHBORS: { face: CubeFace; getNeighbor: (tile: IGridTile3D) => IGridTile3D }[] = [
        { face: CubeFace.PositiveY, getNeighbor: t => t.getUpLinkedTile() },     // +Y
        { face: CubeFace.NegativeY, getNeighbor: t => t.getDownLinkedTile() },   // -Y
        { face: CubeFace.NegativeZ, getNeighbor: t => t.getTopLinkedTile() },    // -Z
        { face: CubeFace.PositiveZ, getNeighbor: t => t.getBottomLinkedTile() }, // +Z
        { face: CubeFace.NegativeX, getNeighbor: t => t.getLeftLinkedTile() },   // -X
        { face: CubeFace.PositiveX, getNeighbor: t => t.getRightLinkedTile() },  // +X
    ];

    // Local-space face normals, index-aligned with FACE_NEIGHBORS.
    private static readonly FACE_NORMALS: readonly Vec3[] = [
        new Vec3(0, 1, 0), new Vec3(0, -1, 0),
        new Vec3(0, 0, -1), new Vec3(0, 0, 1),
        new Vec3(-1, 0, 0), new Vec3(1, 0, 0),
    ];

    // FACE_NORMALS rotated into world space, cached against the rotation they were built from.
    // Every tile shares cubeBlockHolder, so this is recomputed once per pass rather than 6
    // transformQuat calls per tile.
    private static readonly _rotatedFaceNormals: Vec3[] = Array.from({ length: 6 }, () => new Vec3());
    private static readonly _rotatedFaceNormalsKey = new Quat();
    private static _hasRotatedFaceNormals: boolean = false;

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
    private _isReachable: boolean = false;

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

        GridTile3D._faceSamplesByIndex = GridTile3D.FACE_NEIGHBORS.map(
            entry => faceSamples.find(fs => fs.face === entry.face),
        );
    }

    /**
     * FACE_NORMALS in world space for `rotation`, index-aligned with FACE_NEIGHBORS. Recomputed
     * only when the rotation actually differs from the cached one, so a whole pass over the map
     * pays for it once.
     */
    private static getRotatedFaceNormals(rotation: Readonly<Quat>): Vec3[]
    {
        if (GridTile3D._hasRotatedFaceNormals && Quat.equals(GridTile3D._rotatedFaceNormalsKey, rotation))
        {
            return GridTile3D._rotatedFaceNormals;
        }

        for (let i = 0; i < 6; i++)
        {
            Vec3.transformQuat(GridTile3D._rotatedFaceNormals[i], GridTile3D.FACE_NORMALS[i], rotation);
        }
        Quat.copy(GridTile3D._rotatedFaceNormalsKey, rotation);
        GridTile3D._hasRotatedFaceNormals = true;

        return GridTile3D._rotatedFaceNormals;
    }

    /**
     * Projects an axis-aligned world-space box (a cube's occlusion bounds) into screen-space
     * triangles, appending them to `outTriangles` and pulling from `trianglePool` (grown lazily,
     * reused across passes) starting at `poolIndex`. Returns the updated poolIndex.
     *
     * Only the box's camera-facing faces are emitted - 6 triangles instead of 12. A back face can
     * never be the nearest surface along a view ray, so it can never be what hides a sample; the
     * front faces already cover the whole screen silhouette. A triangle is skipped entirely if any
     * of its 3 corners is behind the camera - no near-plane clipping.
     *
     * `ownerIndex` is stamped on every emitted triangle so the owning tile can skip its own box.
     */
    public static projectOcclusionTriangles(camera: Camera, projector: ScreenProjector, worldCenter: Readonly<Vec3>, halfExtents: Readonly<Vec3>, rotation: Readonly<Quat>, ownerIndex: number, trianglePool: ProjectedTriangle[], poolIndex: number, outTriangles: ProjectedTriangle[]): number
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

        const normals = GridTile3D.getRotatedFaceNormals(rotation);
        const cameraPos = camera.node.worldPosition;
        const toCameraX = cameraPos.x - worldCenter.x;
        const toCameraY = cameraPos.y - worldCenter.y;
        const toCameraZ = cameraPos.z - worldCenter.z;

        for (let i = 0; i < FACE_TRIANGLE_INDICES.length; i++)
        {
            // Two triangles per box face, so both share one facing test.
            if ((i & 1) === 0)
            {
                const normal = normals[BOX_FACE_TO_NEIGHBOR_INDEX[i >> 1]];
                const facing = normal.x * toCameraX + normal.y * toCameraY + normal.z * toCameraZ;
                if (facing <= FACING_EPSILON)
                {
                    i++; // skip this face's second triangle too
                    continue;
                }
            }

            const corners = FACE_TRIANGLE_INDICES[i];
            const a = corners[0], b = corners[1], c = corners[2];
            if (!_cornerInFront[a] || !_cornerInFront[b] || !_cornerInFront[c]) continue;

            let triangle = trianglePool[poolIndex];
            if (!triangle)
            {
                triangle = new ProjectedTriangle();
                trianglePool.push(triangle);
            }

            triangle.set(_screenCorners[a], _screenCorners[b], _screenCorners[c], ownerIndex);
            outTriangles.push(triangle);
            poolIndex++;
        }

        return poolIndex;
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
     * Camera-space visibility check for this tile, against the occluders `pass` was prepared with.
     * `ownerIndex` identifies this tile's own triangles, which are skipped so it cannot
     * self-occlude. Faces sealed by a neighbouring cube are skipped entirely (they can never
     * contribute a visible sample), as are faces pointing away from the camera - so a fully
     * enclosed tile does no sampling at all.
     *
     * `worldCenter` is this tile's world position as of the pass, and the rotation comes from the
     * pass too - neither is read live here. The map rotates continuously, so samples have to be
     * placed in the same frame's transform as the occluders they are tested against.
     *
     * Stops early once the pass's visible-sample threshold is cleared, since that is the whole
     * question the caller asks; set pass.exactCounts when the visibility *ratio* is needed too.
     */
    computeVisibility(pass: VisibilityPass, ownerIndex: number, worldCenter: Readonly<Vec3>): VisibilityResult
    {
        const result = this._visibilityResult;
        if (result.samples.length > 0) result.samples.length = 0;
        result.visibleSamples = 0;
        result.totalSamples = 0;

        const faceSamplesByIndex = GridTile3D._faceSamplesByIndex;

        if (!this.isContainBlock() || !faceSamplesByIndex)
        {
            result.visibility = 0;
            return result;
        }

        const camera = pass.camera;
        const projector = pass.projector;
        const occluders = pass.occluders;
        const threshold = pass.visibleSampleThreshold;
        const canExitEarly = !pass.exactCounts;

        // Both come from the pass, so this tile's samples are placed in exactly the transform its
        // occluders were projected from. Hoisted out of the sample loop too: the old code refetched
        // the parent world matrix once per *sample*.
        const worldPosX = worldCenter.x, worldPosY = worldCenter.y, worldPosZ = worldCenter.z;
        const rotation = pass.holderRotation;
        const normals = GridTile3D.getRotatedFaceNormals(rotation);
        const cameraPos = camera.node.worldPosition;

        for (let f = 0; f < GridTile3D.FACE_NEIGHBORS.length; f++)
        {
            const neighbor = GridTile3D.FACE_NEIGHBORS[f].getNeighbor(this);
            if (neighbor && neighbor.isContainBlock()) continue; // sealed face, no need to sample it

            // Deliberately 0, not LevelGrid3D.facingThreshold: this pass also decides whether the
            // cube's own renderer is on, and a face barely off edge-on still contributes to the
            // silhouette the player sees. Applying the targeting threshold here would pop cubes out
            // of the picture. The threshold belongs to the gates that choose a target, not to the
            // question of what is on screen.
            const faceSamples = faceSamplesByIndex[f];
            if (!faceSamples || !GridTile3D.isFacingCamera(normals[f], cameraPos, worldPosX, worldPosY, worldPosZ, 0)) continue;

            const samples = faceSamples.samples;
            for (let s = 0; s < samples.length; s++)
            {
                result.totalSamples++;

                Vec3.transformQuat(_rotatedVectorScratch, samples[s], rotation);
                _worldSampleScratch.set(
                    worldPosX + _rotatedVectorScratch.x,
                    worldPosY + _rotatedVectorScratch.y,
                    worldPosZ + _rotatedVectorScratch.z,
                );

                projector.project(camera, _worldSampleScratch, _screenSampleScratch);

                const screenX = _screenSampleScratch.x;
                const screenY = _screenSampleScratch.y;
                const depth = _screenSampleScratch.z;

                if (depth < pass.near || depth > pass.far) continue;
                if (screenX < pass.viewportMinX || screenX > pass.viewportMaxX) continue;
                if (screenY < pass.viewportMinY || screenY > pass.viewportMaxY) continue;
                if (occluders.isBlocked(screenX, screenY, depth, DEPTH_EPSILON, ownerIndex)) continue;

                result.visibleSamples++;

                // Already past the threshold - no sample can change the verdict from here.
                if (canExitEarly && result.visibleSamples > threshold)
                {
                    result.recalculate();
                    return result;
                }
            }
        }

        result.recalculate();
        return result;
    }

    isReachable(): boolean
    {
        return this._isReachable;
    }

    /**
     * Recomputes whether a bee has a clear way in and out of this tile: some camera-facing face
     * whose corridor - every cell along that face's normal, out of the grid entirely - is empty.
     *
     * This is deliberately the SAME test LevelGrid3D.buildBulletPath() uses to build the path the
     * bullet actually flies, via the shared isCorridorClearOfGrid() below. The two used to differ:
     * this one walked a capped number of hops and fell back to a greedy L-route around blockers,
     * while buildBulletPath() only ever accepts a straight run clear to the grid edge. A tile
     * admitted by the L-route, or by the hop cap stopping short of a blocker, therefore passed
     * findTargetTile() and then failed shootBulletAtTile() - which spends no ammo and takes no
     * reservation, so the shooter re-picked the same tile every FIRE_INTERVAL forever. Corridor
     * clearance is pure occupancy, so rotating the map could not break the cycle either.
     *
     * The facing requirement is only on THIS side (buildBulletPath scores faces by camera-ward but
     * does not require it), which keeps the reachable set a subset of the flyable set: gate passes
     * => a path exists. Never widen this past buildBulletPath without widening that too.
     */
    computeReachability(camera: Camera, minFacing: number): boolean
    {
        this._isReachable = false;

        if (!this.isContainBlock()) return this._isReachable;

        const rotation = this.getWorldRotation();
        const normals = GridTile3D.getRotatedFaceNormals(rotation);
        const worldPos = this.getWorldPos();
        const worldPosX = worldPos.x, worldPosY = worldPos.y, worldPosZ = worldPos.z;
        const cameraPos = camera.node.worldPosition;

        for (let f = 0; f < GridTile3D.FACE_NEIGHBORS.length; f++)
        {
            // Sealed face: not a candidate exit. Cheapest test, so it goes first.
            const neighbor = GridTile3D.FACE_NEIGHBORS[f].getNeighbor(this);
            if (neighbor && neighbor.isContainBlock()) continue;

            if (!GridTile3D.isFacingCamera(normals[f], cameraPos, worldPosX, worldPosY, worldPosZ, minFacing)) continue;

            if (GridTile3D.isCorridorClearOfGrid(this, f))
            {
                this._isReachable = true;
                break;
            }
        }

        return this._isReachable;
    }

    /**
     * Whether the straight run from `tile` along face `faceIndex`'s normal is empty for every cell
     * up to and including the last one inside the grid - i.e. a cube pulled out that way never
     * passes through another cube, and a bullet flown in that way never enters an occupied cell.
     *
     * Walking the linked-tile chain rather than integer coords means "ran out of chain" IS "left
     * the grid": tiles exist for every cell of the grid box (spawnLevel creates them all, occupied
     * or not), so a null neighbour can only mean the edge.
     *
     * Deliberately uncapped. A capped walk answers "is the first N cells clear", which is not the
     * same question and is not what a bullet needs - see computeReachability() above.
     */
    public static isCorridorClearOfGrid(tile: IGridTile3D, faceIndex: number): boolean
    {
        const getNeighbor = GridTile3D.FACE_NEIGHBORS[faceIndex].getNeighbor;
        let current: IGridTile3D = tile;

        while (true)
        {
            const next = getNeighbor(current);
            if (!next) return true;                  // walked out of the grid: clear
            if (next.isContainBlock()) return false; // blocked
            current = next;
        }
    }

    /** The local-space outward normal of face `faceIndex`, index-aligned with the face table. */
    public static getFaceNormal(faceIndex: number): Readonly<Vec3>
    {
        return GridTile3D.FACE_NORMALS[faceIndex];
    }

    /** `tile`'s neighbour across face `faceIndex`, or null when that cell is outside the grid. */
    public static getFaceNeighbor(tile: IGridTile3D, faceIndex: number): IGridTile3D
    {
        return GridTile3D.FACE_NEIGHBORS[faceIndex].getNeighbor(tile);
    }

    /** How many faces the face-indexed statics above accept. */
    public static get faceCount(): number
    {
        return GridTile3D.FACE_NEIGHBORS.length;
    }

    /**
     * Whether a face with the (already world-space) normal `worldNormal` on a cube centered at
     * (centerX, centerY, centerZ) points towards the camera by at least `minFacing`, measured as
     * cos(angle): 1 = head-on, 0 = edge-on.
     *
     * The to-camera vector has to be normalized for that to hold, which a plain sign test does not
     * need - an unnormalized dot scales with distance to the camera, so comparing it against a
     * tuned threshold would mean a different angle at every distance. Compared in squared form,
     * guarded by the sign, so the common case costs no sqrt.
     *
     * Using the tile center rather than the exact face center is a safe approximation since cubes
     * are unscaled and cameras sit well outside a single cube's half-extent. The direction is
     * per-tile rather than one constant view vector, which is what keeps this correct under a
     * perspective camera - the shipped original uses a single viewDir and is orthographic-only.
     */
    private static isFacingCamera(worldNormal: Readonly<Vec3>, cameraPos: Readonly<Vec3>, centerX: number, centerY: number, centerZ: number, minFacing: number): boolean
    {
        const toCameraX = cameraPos.x - centerX;
        const toCameraY = cameraPos.y - centerY;
        const toCameraZ = cameraPos.z - centerZ;

        const dot = worldNormal.x * toCameraX + worldNormal.y * toCameraY + worldNormal.z * toCameraZ;
        if (dot <= FACING_EPSILON) return false;
        if (minFacing <= 0) return true;

        const distanceSqr = toCameraX * toCameraX + toCameraY * toCameraY + toCameraZ * toCameraZ;
        return dot * dot > minFacing * minFacing * distanceSqr;
    }
}
