import { math, Vec3 } from "cc";

export function lerpMultiplePoints(out: Vec3, points: Vec3[], t: number): void
{    
    // Early return if not enough points
    if (points.length < 2) {
        if (points.length === 1) {
            Vec3.copy(out, points[0]);
        }
        return;
    }

    // Clamp t to the range [0, 1]
    t = Math.max(0, Math.min(1, t));

    // Handle edge case when t is exactly 1
    if (t === 1) {
        Vec3.copy(out, points[points.length - 1]);
        return;
    }

    // Find the segment the t value is in
    const segmentLength = 1 / (points.length - 1);
    const segmentIndex = Math.floor(t / segmentLength);
    const segmentT = (t % segmentLength) / segmentLength;

    // Ensure we don't go out of bounds
    const clampedIndex = Math.min(segmentIndex, points.length - 2);
    
    // Perform linear interpolation between the two points
    const start = points[clampedIndex];
    const end = points[clampedIndex + 1];
    Vec3.lerp(out, start, end, segmentT);
}

export function lerp3(a: number, b: number, c: number, t: number): number
{
    if (t < 0.5)
    {
        return math.lerp(a, b, t * 2); // From A to B
    } else
    {
        return math.lerp(b, c, (t - 0.5) * 2); // From B to C
    }
}

export function shuffleArray<T>(array: T[]): T[]
{
    for (let i = array.length - 1; i > 0; i--)
    {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Linearly interpolates between three Vec3s: A -> B -> C
 * @param A Starting point
 * @param B Middle point
 * @param C End point
 * @param t Interpolation value (0 to 1)
 * @returns A new Vec3 interpolated across A → B → C
 */
export function lerp3Vec3(A: Vec3, B: Vec3, C: Vec3, t: number, out: Vec3): Vec3
{
    if (t < 0.5)
    {
        // Lerp from A to B
        const lerpT = t / 0.5;
        out = Vec3.lerp(out, A, B, lerpT);
    } else
    {
        // Lerp from B to C
        const lerpT = (t - 0.5) / 0.5;
        out = Vec3.lerp(out, B, C, lerpT);
    }
    return out
}