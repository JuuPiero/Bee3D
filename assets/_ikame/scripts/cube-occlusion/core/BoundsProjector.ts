import {
    Camera,
    Node,
    Vec3,
} from 'cc';

import { ScreenProjector } from './ScreenProjector';
import { ProjectedTriangle } from './ProjectedTriangle';

/**
 * Corner index triples for the 6 faces of the box
 * (2 triangles per face = 12 total), referencing the
 * 8-corner ordering built by buildLocalCorners().
 *
 * Winding does not matter - the occlusion checker's
 * barycentric test does not depend on it.
 */
const FACE_TRIANGLE_INDICES: readonly (readonly [number, number, number])[] = [
    // bottom (-Y)
    [0, 1, 3], [0, 3, 2],
    // top (+Y)
    [4, 5, 7], [4, 7, 6],
    // +X
    [1, 3, 7], [1, 7, 5],
    // -X
    [0, 2, 6], [0, 6, 4],
    // +Z
    [2, 3, 7], [2, 7, 6],
    // -Z
    [0, 1, 5], [0, 5, 4],
];

export class BoundsProjector {

    /**
     * Reused local-space corners.
     */
    private readonly _localCorners: Vec3[] = [
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
    ];

    /**
     * Reused world-space position.
     */
    private readonly _worldPosition =
        new Vec3();

    /**
     * Reused projected screen positions,
     * one per local corner (index-aligned
     * with _localCorners).
     */
    private readonly _screenPositions: Vec3[] = [
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
    ];

    /**
     * Whether each corner projected in front
     * of the camera this call.
     */
    private readonly _cornerInFront: boolean[] = [
        false, false, false, false,
        false, false, false, false,
    ];

    /**
     * Projects an invisible oriented box into up to
     * 12 screen-space triangles (2 per face).
     *
     * center and size are LOCAL to the supplied Node.
     *
     * ScreenProjector.prepare(camera) must have
     * already been called.
     *
     * trianglePool is grown lazily and reused across
     * calls/frames - poolIndex is the next free slot.
     * Valid triangles are appended to outTriangles.
     *
     * Returns the updated poolIndex.
     */
    public project(
        camera: Camera,
        projector: ScreenProjector,
        node: Node,
        center: Readonly<Vec3>,
        size: Readonly<Vec3>,
        trianglePool: ProjectedTriangle[],
        poolIndex: number,
        outTriangles: ProjectedTriangle[],
    ): number {

        this.buildLocalCorners(
            center,
            size,
        );

        const worldMatrix =
            node.worldMatrix;

        for (
            let i = 0;
            i < this._localCorners.length;
            i++
        ) {

            /**
             * Local box corner
             *      ↓
             * Node transform
             *      ↓
             * World position
             */
            Vec3.transformMat4(
                this._worldPosition,
                this._localCorners[i],
                worldMatrix,
            );

            /**
             * World
             *   ↓
             * Screen X/Y + camera depth
             */
            projector.project(
                camera,
                this._worldPosition,
                this._screenPositions[i],
            );

            this._cornerInFront[i] =
                projector.isInFront(
                    this._screenPositions[i].z,
                );
        }

        for (const [a, b, c] of FACE_TRIANGLE_INDICES) {

            /**
             * Skip the whole triangle if any of its
             * corners are behind the camera - no
             * near-plane clipping is performed.
             */
            if (
                !this._cornerInFront[a] ||
                !this._cornerInFront[b] ||
                !this._cornerInFront[c]
            ) {
                continue;
            }

            let triangle =
                trianglePool[poolIndex];

            if (!triangle) {
                triangle = new ProjectedTriangle();

                trianglePool.push(triangle);
            }

            triangle.set(
                this._screenPositions[a],
                this._screenPositions[b],
                this._screenPositions[c],
            );

            outTriangles.push(triangle);

            poolIndex++;
        }

        return poolIndex;
    }

    /**
     * Generate the 8 corners of the box
     * in LOCAL space.
     */
    private buildLocalCorners(
        center: Readonly<Vec3>,
        size: Readonly<Vec3>,
    ): void {

        const halfX =
            Math.abs(size.x) * 0.5;

        const halfY =
            Math.abs(size.y) * 0.5;

        const halfZ =
            Math.abs(size.z) * 0.5;

        const minX =
            center.x - halfX;

        const maxX =
            center.x + halfX;

        const minY =
            center.y - halfY;

        const maxY =
            center.y + halfY;

        const minZ =
            center.z - halfZ;

        const maxZ =
            center.z + halfZ;

        this._localCorners[0].set(
            minX,
            minY,
            minZ,
        );

        this._localCorners[1].set(
            maxX,
            minY,
            minZ,
        );

        this._localCorners[2].set(
            minX,
            minY,
            maxZ,
        );

        this._localCorners[3].set(
            maxX,
            minY,
            maxZ,
        );

        this._localCorners[4].set(
            minX,
            maxY,
            minZ,
        );

        this._localCorners[5].set(
            maxX,
            maxY,
            minZ,
        );

        this._localCorners[6].set(
            minX,
            maxY,
            maxZ,
        );

        this._localCorners[7].set(
            maxX,
            maxY,
            maxZ,
        );
    }
}