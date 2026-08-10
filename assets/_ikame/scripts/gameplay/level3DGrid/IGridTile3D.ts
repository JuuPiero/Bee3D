import { Camera, Vec3 } from 'cc';
import { VisibilityResult } from '../../cube-occlusion/data/VisibilityResult';
import type { VisibilityPass } from './VisibilityPass';

export interface IGridTile3D {
    getCoordX(): number;
    getCoordY(): number;
    getCoordZ(): number;

    getLocalPos(): Vec3;
    getWorldPos(): Vec3;

    /** Cube data lives on the tile; there is no per-cube node/component anymore. */
    setCubeData(colorID: number, health: number): void;
    clearCubeData(): void;
    getColorID(): number;
    getHealth(): number;
    isMatchingColorID(colorID: number): boolean;
    isContainBlock(): boolean;
    isEmpty(): boolean;

    setLinkedTiles(
        up: IGridTile3D,
        down: IGridTile3D,
        top: IGridTile3D,
        bottom: IGridTile3D,
        left: IGridTile3D,
        right: IGridTile3D
    ): void;
    /** +Y */
    getUpLinkedTile(): IGridTile3D;
    /** -Y */
    getDownLinkedTile(): IGridTile3D;
    /** -Z */
    getTopLinkedTile(): IGridTile3D;
    /** +Z */
    getBottomLinkedTile(): IGridTile3D;
    /** -X */
    getLeftLinkedTile(): IGridTile3D;
    /** +X */
    getRightLinkedTile(): IGridTile3D;

    /** True when all 6 neighbours are occupied, i.e. this cube can never be seen. */
    isEnclosed(): boolean;

    /**
     * Recomputes and returns this tile's visibility against the camera and the bucketed occluder
     * triangles `pass` was prepared with. `ownerIndex` is this tile's index in the pass's tile
     * list, stamped on its own triangles so they are skipped and it can't self-occlude.
     * `worldCenter` is this tile's world position as of that pass - passed in, together with the
     * pass's frozen holder rotation, so the samples land in the same transform as the occluders
     * even when the map has rotated since the pass began.
     */
    computeVisibility(pass: VisibilityPass, ownerIndex: number, worldCenter: Readonly<Vec3>): VisibilityResult;
    getVisibilityResult(): VisibilityResult;

    /**
     * Recomputes and returns whether a bee has a clear way in and out of this tile: either a
     * straight corridor out to the pile edge along a camera-facing face, or - if every straight
     * corridor is blocked - a greedy L-shaped route that turns around blockers (up to `turnCap`
     * turns) until it clears the pile. `extractionRadius` and `cellSize` are both world units;
     * internally everything is converted to, and walked in, integer grid cells.
     */
    computeReachability(camera: Camera, extractionRadius: number, cellSize: number, turnCap: number): boolean;
    isReachable(): boolean;
}
