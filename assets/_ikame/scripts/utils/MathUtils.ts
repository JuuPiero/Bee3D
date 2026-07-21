import { math, Vec3 } from "cc";

// Cache cumulative arc-length tables per points array so repeated calls (eg. every tween update)
// don't recompute distances each frame. Keyed by array identity, so callers must not mutate
// the points array in place while reusing it across calls.
const cumulativeDistanceCache = new WeakMap<Vec3[], number[]>();

function getCumulativeDistances(points: Vec3[]): number[]
{
    let cumulative = cumulativeDistanceCache.get(points);
    if (cumulative) return cumulative;

    cumulative = [0];
    for (let i = 1; i < points.length; i++)
    {
        cumulative.push(cumulative[i - 1] + Vec3.distance(points[i - 1], points[i]));
    }
    cumulativeDistanceCache.set(points, cumulative);
    return cumulative;
}

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

    // Use cumulative arc length instead of equal index-based segments, so speed stays
    // consistent even when waypoints are unevenly spaced.
    const cumulative = getCumulativeDistances(points);
    const totalLength = cumulative[cumulative.length - 1];

    if (totalLength === 0) {
        Vec3.copy(out, points[0]);
        return;
    }

    const targetDist = t * totalLength;

    // Find the segment containing targetDist
    let segmentIndex = 0;
    while (segmentIndex < cumulative.length - 2 && cumulative[segmentIndex + 1] < targetDist) {
        segmentIndex++;
    }

    const segmentStartDist = cumulative[segmentIndex];
    const segmentLength = cumulative[segmentIndex + 1] - segmentStartDist;
    const segmentT = segmentLength > 0 ? (targetDist - segmentStartDist) / segmentLength : 0;

    // Perform linear interpolation between the two points
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
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

export function pathLength(path: Vec3[])
{
    let length = 0;
    for (let i = 1; i < path.length - 1; i++)
    {
        length += Vec3.distance(path[i - 1], path[i]);
    }
    return length;
}