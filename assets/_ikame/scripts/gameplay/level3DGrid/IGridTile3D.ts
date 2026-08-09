import { Camera, Vec3 } from 'cc';
import { ScreenProjector } from '../../cube-occlusion/core/ScreenProjector';
import { VisibilityResult } from '../../cube-occlusion/data/VisibilityResult';
import type { ProjectedTriangle } from './ProjectedTriangle';

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
     * Recomputes and returns this tile's visibility against the given camera and the
     * current frame's projected occluder triangles. [excludeStart, excludeEnd) marks this
     * tile's own triangle range within `triangles`, which is skipped so it can't self-occlude.
     */
    computeVisibility(camera: Camera, projector: ScreenProjector, triangles: readonly ProjectedTriangle[], excludeStart: number, excludeEnd: number): VisibilityResult;
    getVisibilityResult(): VisibilityResult;
}
