import { geometry, Vec3 } from 'cc';

export enum CubeFace {
    PositiveX,
    NegativeX,
    PositiveY,
    NegativeY,
    PositiveZ,
    NegativeZ,
}

export interface FaceSamples {
    face: CubeFace;

    /**
     * Face normal in local space.
     */
    normal: Vec3;

    /**
     * Sample positions in local space.
     */
    samples: Vec3[];
}

export class CubeFaceSampler {

    /**
     * Generate sample points on all 6 faces.
     *
     * margin is normalized:
     *
     * 0.0 = samples touch edges
     * 0.1 = 10% inset
     * 0.2 = 20% inset
     *
     * margin should stay below 0.5.
     */
    public static generate(
        bounds: geometry.AABB,
        gridSize: number = 3,
        margin: number = 0.1,
    ): FaceSamples[] {

        gridSize = Math.max(
            1,
            Math.floor(gridSize),
        );

        // Prevent invalid / inverted sampling area.
        margin = Math.max(
            0,
            Math.min(margin, 0.49),
        );

        const center = bounds.center;
        const half = bounds.halfExtents;

        const minX = center.x - half.x;
        const maxX = center.x + half.x;

        const minY = center.y - half.y;
        const maxY = center.y + half.y;

        const minZ = center.z - half.z;
        const maxZ = center.z + half.z;

        return [
            {
                face: CubeFace.PositiveX,
                normal: new Vec3(1, 0, 0),

                samples: this.generateFace(
                    gridSize,
                    margin,
                    (u, v) =>
                        new Vec3(
                            maxX,
                            this.lerp(minY, maxY, u),
                            this.lerp(minZ, maxZ, v),
                        ),
                ),
            },

            {
                face: CubeFace.NegativeX,
                normal: new Vec3(-1, 0, 0),

                samples: this.generateFace(
                    gridSize,
                    margin,
                    (u, v) =>
                        new Vec3(
                            minX,
                            this.lerp(minY, maxY, u),
                            this.lerp(minZ, maxZ, v),
                        ),
                ),
            },

            {
                face: CubeFace.PositiveY,
                normal: new Vec3(0, 1, 0),

                samples: this.generateFace(
                    gridSize,
                    margin,
                    (u, v) =>
                        new Vec3(
                            this.lerp(minX, maxX, u),
                            maxY,
                            this.lerp(minZ, maxZ, v),
                        ),
                ),
            },

            {
                face: CubeFace.NegativeY,
                normal: new Vec3(0, -1, 0),

                samples: this.generateFace(
                    gridSize,
                    margin,
                    (u, v) =>
                        new Vec3(
                            this.lerp(minX, maxX, u),
                            minY,
                            this.lerp(minZ, maxZ, v),
                        ),
                ),
            },

            {
                face: CubeFace.PositiveZ,
                normal: new Vec3(0, 0, 1),

                samples: this.generateFace(
                    gridSize,
                    margin,
                    (u, v) =>
                        new Vec3(
                            this.lerp(minX, maxX, u),
                            this.lerp(minY, maxY, v),
                            maxZ,
                        ),
                ),
            },

            {
                face: CubeFace.NegativeZ,
                normal: new Vec3(0, 0, -1),

                samples: this.generateFace(
                    gridSize,
                    margin,
                    (u, v) =>
                        new Vec3(
                            this.lerp(minX, maxX, u),
                            this.lerp(minY, maxY, v),
                            minZ,
                        ),
                ),
            },
        ];
    }

    private static generateFace(
        gridSize: number,
        margin: number,
        createPoint: (
            u: number,
            v: number,
        ) => Vec3,
    ): Vec3[] {

        const samples: Vec3[] = [];

        for (let y = 0; y < gridSize; y++) {

            const v = this.gridRatio(
                y,
                gridSize,
                margin,
            );

            for (let x = 0; x < gridSize; x++) {

                const u = this.gridRatio(
                    x,
                    gridSize,
                    margin,
                );

                samples.push(
                    createPoint(u, v),
                );
            }
        }

        return samples;
    }

    private static gridRatio(
        index: number,
        gridSize: number,
        margin: number,
    ): number {

        /**
         * One sample always sits exactly
         * at the center.
         */
        if (gridSize === 1) {
            return 0.5;
        }

        const t =
            index / (gridSize - 1);

        /**
         * Remap:
         *
         * 0..1
         *
         * into:
         *
         * margin .. 1-margin
         */
        return (
            margin +
            t * (1 - margin * 2)
        );
    }

    private static lerp(
        min: number,
        max: number,
        t: number,
    ): number {

        return min + (max - min) * t;
    }
}