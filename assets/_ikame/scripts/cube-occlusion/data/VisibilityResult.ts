import { SamplePoint } from './SamplePoint';

export class VisibilityResult {
    /**
     * Final visibility value in range 0.0 - 1.0.
     */
    public visibility: number = 1.0;

    /**
     * Number of visible sample points.
     */
    public visibleSamples: number = 0;

    /**
     * Total number of samples used in the calculation.
     */
    public totalSamples: number = 0;

    /**
     * Optional sample data.
     * Useful for debugging / visualization.
     */
    public samples: SamplePoint[] = [];

    constructor(
        visibleSamples: number = 0,
        totalSamples: number = 0,
        samples: SamplePoint[] = [],
    ) {
        this.visibleSamples = visibleSamples;
        this.totalSamples = totalSamples;
        this.samples = samples;

        this.visibility =
            totalSamples > 0
                ? visibleSamples / totalSamples
                : 0;
    }

    /**
     * Recalculate visibility from the current counts.
     */
    public recalculate(): void {
        this.visibility =
            this.totalSamples > 0
                ? this.visibleSamples / this.totalSamples
                : 0;
    }

    /**
     * Reset this result so it can be reused.
     */
    public reset(): void {
        this.visibility = 1.0;
        this.visibleSamples = 0;
        this.totalSamples = 0;
        this.samples.length = 0;
    }
}