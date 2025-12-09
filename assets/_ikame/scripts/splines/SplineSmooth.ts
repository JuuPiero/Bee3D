import { _decorator, Camera, CCBoolean, Color, Component, director, Enum, geometry, Graphics, Node, Quat, Vec2, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, property } = _decorator;

enum ESplineType {
    LINEAR,
    BEZIER,
    CATMULL_ROM,
    SMOOTH
}

@ccclass('SplineSmooth')
export class SplineSmooth extends Component {
    
    @property({ type: [Vec3] })
    positions: Vec3[] = [];

    _camera: Camera | null = null;

    @property({ type: Enum(ESplineType) })
    splineType: ESplineType = ESplineType.LINEAR;

    @property
    closedLoop: boolean = false;

    @property
    reverseDirection: boolean = false;

    @property(CCBoolean)
    public debugDraw: boolean = false;

    @property({
        visible: function(this: SplineSmooth) {
            return this.splineType === ESplineType.SMOOTH;
        }
    })
    bevelSegments: number = 0;

    @property({
        visible: function(this: SplineSmooth) {
            return this.splineType === ESplineType.SMOOTH;
        }
    })
    bevelWidth: number = 0.5;

    @property({
        visible: function(this: SplineSmooth) {
            return this.splineType === ESplineType.BEZIER || this.splineType === ESplineType.CATMULL_ROM;
        }
    })
    curveSegments: number = 20;

    @property({
        visible: function(this: SplineSmooth) {
            return this.splineType === ESplineType.CATMULL_ROM;
        }
    })
    catmullRomAlpha: number = 0.5;

    protected _smoothPath: Vec3[] = [];
    protected _smoothPathLength: number = -10;

    protected start(): void
    {
        this.setPositions(this.positions);

        if (EDITOR)
        {
            const cameraNode = director.getScene().getChildByName('Main Camera');
            this._camera = cameraNode ? cameraNode.getComponent(Camera) : null;
            this._camera?.camera.initGeometryRenderer();            // this._debugDrawSpline();
        }
    }

    protected generatePathCurve(): Vec3[] {
        let result: Vec3[] = [];
        
        switch (this.splineType) {
            case ESplineType.LINEAR:
                result = this.positions.map(p => p.clone());
                break;
            case ESplineType.BEZIER:
                result = this.generateBezierPath();
                break;
            case ESplineType.CATMULL_ROM:
                result = this.generateCatmullRomPath();
                break;
            case ESplineType.SMOOTH:
                result = this.generateSmoothPath();
                break;
            default:
                result = this.positions.map(p => p.clone());
                break;
        }

        // Close the loop if enabled
        if (this.closedLoop && result.length > 0 && !this.isPointsEqual(result[0], result[result.length - 1])) {
            result.push(result[0].clone());
        }

        // Reverse the direction if enabled
        if (this.reverseDirection) {
            result.reverse();
        }

        return result;
    }

    protected isPointsEqual(p1: Vec3, p2: Vec3, epsilon: number = 1e-6): boolean {
        return Math.abs(p1.x - p2.x) < epsilon && 
               Math.abs(p1.y - p2.y) < epsilon && 
               Math.abs(p1.z - p2.z) < epsilon;
    }

    /**
     * Generate a Bezier curve path from control points
     * For cubic Bezier: every 4 points define a curve segment
     * For quadratic Bezier: every 3 points define a curve segment
     */
    protected generateBezierPath(): Vec3[] {
        const result: Vec3[] = [];
        
        if (!this.positions || this.positions.length < 2) {
            return result;
        }

        // If we have exactly 2 or 3 points, treat as linear or quadratic
        if (this.positions.length === 2) {
            result.push(this.positions[0].clone());
            result.push(this.positions[1].clone());
            return result;
        }

        if (this.positions.length === 3 && !this.closedLoop) {
            // Quadratic Bezier
            for (let i = 0; i <= this.curveSegments; i++) {
                const t = i / this.curveSegments;
                const point = this.quadraticBezier(
                    this.positions[0],
                    this.positions[1],
                    this.positions[2],
                    t
                );
                result.push(point);
            }
            return result;
        }

        // Cubic Bezier curves - process groups of 4 points
        // Each cubic segment uses 4 control points
        const numSegments = this.closedLoop 
            ? Math.ceil(this.positions.length / 3)
            : Math.floor((this.positions.length - 1) / 3);

        for (let seg = 0; seg < numSegments; seg++) {
            const i = seg * 3;
            const p0 = this.positions[i % this.positions.length];
            const p1 = this.positions[(i + 1) % this.positions.length];
            const p2 = this.positions[(i + 2) % this.positions.length];
            const p3 = this.positions[(i + 3) % this.positions.length];

            for (let j = 0; j <= this.curveSegments; j++) {
                // Skip the first point of subsequent segments to avoid duplication
                if (seg > 0 && j === 0) continue;
                
                const t = j / this.curveSegments;
                const point = this.cubicBezier(p0, p1, p2, p3, t);
                result.push(point);
            }
        }

        // If there are remaining points and not closed loop, add them linearly
        if (!this.closedLoop) {
            const processed = Math.floor((this.positions.length - 1) / 3) * 3 + 1;
            for (let i = processed; i < this.positions.length; i++) {
                result.push(this.positions[i].clone());
            }
        }

        return result;
    }

    /**
     * Quadratic Bezier interpolation
     * B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
     */
    protected quadraticBezier(p0: Vec3, p1: Vec3, p2: Vec3, t: number): Vec3 {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const ut2 = 2 * u * t;

        const result = new Vec3();
        result.x = uu * p0.x + ut2 * p1.x + tt * p2.x;
        result.y = uu * p0.y + ut2 * p1.y + tt * p2.y;
        result.z = uu * p0.z + ut2 * p1.z + tt * p2.z;

        return result;
    }

    /**
     * Cubic Bezier interpolation
     * B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
     */
    protected cubicBezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const ttt = tt * t;
        const uuu = uu * u;
        const uu3t = 3 * uu * t;
        const u3tt = 3 * u * tt;

        const result = new Vec3();
        result.x = uuu * p0.x + uu3t * p1.x + u3tt * p2.x + ttt * p3.x;
        result.y = uuu * p0.y + uu3t * p1.y + u3tt * p2.y + ttt * p3.y;
        result.z = uuu * p0.z + uu3t * p1.z + u3tt * p2.z + ttt * p3.z;

        return result;
    }

    /**
     * Generate a Catmull-Rom spline path
     * Creates a smooth curve that passes through all control points
     */
    protected generateCatmullRomPath(): Vec3[] {
        const result: Vec3[] = [];
        
        if (!this.positions || this.positions.length < 2) {
            return result;
        }

        // Need at least 2 points
        if (this.positions.length === 2) {
            result.push(this.positions[0].clone());
            result.push(this.positions[1].clone());
            return result;
        }

        const numSegments = this.closedLoop ? this.positions.length : this.positions.length - 1;

        // For each segment between control points
        for (let i = 0; i < numSegments; i++) {
            // Get the 4 control points for this segment
            const p0 = this.getControlPoint(i - 1);
            const p1 = this.getControlPoint(i);
            const p2 = this.getControlPoint(i + 1);
            const p3 = this.getControlPoint(i + 2);

            // Calculate knot intervals based on alpha
            const dt0 = Math.pow(Vec3.distance(p0, p1), this.catmullRomAlpha);
            const dt1 = Math.pow(Vec3.distance(p1, p2), this.catmullRomAlpha);
            const dt2 = Math.pow(Vec3.distance(p2, p3), this.catmullRomAlpha);

            // Avoid division by zero
            const t0 = 0;
            const t1 = dt0 > 1e-6 ? dt0 : 1;
            const t2 = t1 + (dt1 > 1e-6 ? dt1 : 1);
            const t3 = t2 + (dt2 > 1e-6 ? dt2 : 1);

            for (let j = 0; j <= this.curveSegments; j++) {
                // Skip first point of subsequent segments to avoid duplication
                if (i > 0 && j === 0) continue;

                const t = t1 + (j / this.curveSegments) * (t2 - t1);
                const point = this.catmullRomInterpolate(p0, p1, p2, p3, t0, t1, t2, t3, t);
                result.push(point);
            }
        }

        return result;
    }

    /**
     * Get control point with wrapping support for closed loops
     */
    protected getControlPoint(index: number): Vec3 {
        const len = this.positions.length;
        
        if (this.closedLoop) {
            // Wrap around for closed loops
            const wrappedIndex = ((index % len) + len) % len;
            return this.positions[wrappedIndex];
        } else {
            // Clamp for open paths
            if (index < 0) return this.positions[0];
            if (index >= len) return this.positions[len - 1];
            return this.positions[index];
        }
    }

    /**
     * Catmull-Rom interpolation helper
     */
    protected catmullRomInterpolate(
        p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3,
        t0: number, t1: number, t2: number, t3: number,
        t: number
    ): Vec3 {
        const l01 = t1 - t0;
        const l12 = t2 - t1;
        const l23 = t3 - t2;

        const a1 = this.lerpVec3(p0, p1, l01 > 1e-6 ? (t - t0) / l01 : 0);
        const a2 = this.lerpVec3(p1, p2, l12 > 1e-6 ? (t - t1) / l12 : 0);
        const a3 = this.lerpVec3(p2, p3, l23 > 1e-6 ? (t - t2) / l23 : 0);

        const l02 = t2 - t0;
        const l13 = t3 - t1;

        const b1 = this.lerpVec3(a1, a2, l02 > 1e-6 ? (t - t0) / l02 : 0);
        const b2 = this.lerpVec3(a2, a3, l13 > 1e-6 ? (t - t1) / l13 : 0);

        return this.lerpVec3(b1, b2, l12 > 1e-6 ? (t - t1) / l12 : 0);
    }

    /**
     * Linear interpolation between two Vec3 points
     */
    protected lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
        return new Vec3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );
    }

    protected generateSmoothPath(): Vec3[] {
        const toV3 = (v: Vec3) => new Vec3(v.x, v.y, v.z);
        const result: Vec3[] = [];
        if (!this.positions || this.positions.length < 2) return result;
        const slerpDir = (a: Vec3, b: Vec3, t: number) => {
            const dot = Math.max(-1, Math.min(1, Vec3.dot(a, b)));
            const omega = Math.acos(dot);
            if (omega < 1e-5) {
                const out = a.clone().multiplyScalar(1 - t).add(b.clone().multiplyScalar(t));
                return out.normalize();
            }
            const sinOmega = Math.sin(omega);
            const s0 = Math.sin((1 - t) * omega) / sinOmega;
            const s1 = Math.sin(t * omega) / sinOmega;
            const out = a.clone().multiplyScalar(s0).add(b.clone().multiplyScalar(s1));
            return out.normalize();
        };

        if (this.positions.length < 3) {
            const start = toV3(this.positions[0]);
            const end = toV3(this.positions[1]);
            result.push(start, end);
            return result;
        }

        // Case: bevelSegments == 0 -> return raw path
        if (this.bevelSegments === 0) {
            for (let i = 0; i < this.positions.length; i++) {
                result.push(toV3(this.positions[i]));
            }
            return result;
        }

        // Process points with corner detection and optional bevel subdivisions
        const numPoints = this.closedLoop ? this.positions.length : this.positions.length;
        
        for (let i = 0; i < numPoints; i++) {
            const prevIdx = this.closedLoop ? (i - 1 + this.positions.length) % this.positions.length : Math.max(0, i - 1);
            const currIdx = i;
            const nextIdx = this.closedLoop ? (i + 1) % this.positions.length : Math.min(this.positions.length - 1, i + 1);
            
            const prev = toV3(this.positions[prevIdx]);
            const current = toV3(this.positions[currIdx]);
            const next = toV3(this.positions[nextIdx]);

            // For first and last points in open path, just add them directly
            if (!this.closedLoop && (i === 0 || i === this.positions.length - 1)) {
                result.push(current);
                continue;
            }

            const dir1 = current.clone().subtract(prev).normalize();
            const dir2 = next.clone().subtract(current).normalize();
            // Angle in degrees
            const dot = Math.max(-1, Math.min(1, Vec3.dot(dir1, dir2)));
            const angleDeg = Math.acos(dot) * 180 / Math.PI;

            if (angleDeg > 30) {
                const negDir2 = dir2.clone().multiplyScalar(-1);
                for (let s = this.bevelSegments; s >= 0; s--) {
                    const t = this.bevelSegments === 0 ? 0 : (s / this.bevelSegments);
                    const lerpDir = slerpDir(dir1, negDir2, t);
                    const arcPoint = current.clone().add(lerpDir.clone().multiplyScalar(this.bevelWidth * 0.5));
                    const bias = dir1.clone().subtract(dir2).multiplyScalar(0.5 * this.bevelWidth);
                    arcPoint.subtract(bias);
                    result.push(arcPoint);
                }
            } else {
                result.push(current);
            }
        }

        return result;
    }

    public getPercentageTransform(percent: number, outPos: Vec3, outQuat: Quat): boolean
    {
        if (percent < 0 || percent > 1)
        {
            return false;
        }
        if (this._smoothPath.length < 2)
        {
            return false;
        }
        const fullPath = this._smoothPath;
        if (!fullPath || fullPath.length < 2) return false;
        let totalLen = 0;
        for (let i = 1; i < fullPath.length; i++) totalLen += Vec3.distance(fullPath[i - 1], fullPath[i]);
        const clampedPercent = Math.max(0, Math.min(1, percent));
        const targetD = totalLen * clampedPercent;
        return this.getTransformAtDistance(targetD, outPos, outQuat);
    }

    /** Compute transform (position + orientation) at a world-distance along the smoothed path */
    protected getTransformAtDistance(dist: number, outPos: Vec3, outQuat: Quat): boolean {
        
        if (this._smoothPath.length < 2)
        {
            return false;
        }
        
        const path = this._smoothPath;
        if (!path || path.length < 2) return false;

        // Build cumulative lengths
        const cum: number[] = [0];
        for (let i = 1; i < path.length; i++) {
            cum[i] = cum[i - 1] + Vec3.distance(path[i - 1], path[i]);
        }
        const total = cum[cum.length - 1];
        if (total <= 1e-6) return false;

        // Clamp target distance
        const d = Math.max(0, Math.min(total, dist));

        // Find segment index i so that cum[i] <= d <= cum[i+1]
        let i = 0;
        while (i < cum.length - 1 && cum[i + 1] < d) i++;
        const segLen = Math.max(1e-6, cum[i + 1] - cum[i]);
        const t = (d - cum[i]) / segLen;

        // Position by linear interpolation
        const a = path[i], b = path[i + 1];
        outPos.set(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );

        // Forward consistent with ring construction
        let forward: Vec3;
        if (i === 0) {
            forward = b.clone().subtract(a).normalize();
        } else if (i >= path.length - 2) {
            forward = path[path.length - 1].clone().subtract(path[path.length - 2]).normalize();
        } else {
            forward = path[i + 1].clone().subtract(path[i - 1]).multiplyScalar(0.5).normalize();
        }

        // Build an orthonormal frame using a world-up preference, matching updateMeshData
        let up = new Vec3(0, 1, 0);
        const right = new Vec3();
        Vec3.cross(right, forward, up);
        if (right.length() < 1e-6) {
            // If forward ~ up, pick a different up to avoid degeneracy
            up = new Vec3(0, 0, 1);
            Vec3.cross(right, forward, up);
        }
        right.normalize();
        Vec3.cross(up, right, forward);
        up.normalize();

        Quat.fromViewUp(outQuat, forward, up);
        return true;
    }

    public getPercentageAtDistance(distance: number): number
    {
        const pathLength = this.getPathLength();
        return Math.max(0, Math.min(1, distance / pathLength));
    }

    public setPositions(positions: Vec3[]): void
    {
        if (!positions || positions.length < 2)
        {
            return;
        }
        this.positions = positions;
        this._smoothPath = this.generatePathCurve();
        this._smoothPathLength = this.calculateSmoothPathLength();
    }

    public getPathLength(): number
    {
        if (this._smoothPathLength < 0)
        {
            this._smoothPathLength = this.calculateSmoothPathLength();
        }
        return this._smoothPathLength;
    }

    public getSmoothPathLength(): number
    {
        return this._smoothPathLength;
    }

    protected calculateSmoothPathLength(): number
    {
        let length = 0;
        for (let i = 1; i < this._smoothPath.length; i++)
        {
            length += Vec3.distance(this._smoothPath[i - 1], this._smoothPath[i]);
        }
        return length;
    }

    protected update(dt: number): void
    {
        if (EDITOR)
        {
            this.setPositions(this.positions);
        }
    }

    protected lateUpdate(dt: number): void
    {
        if (EDITOR)
            this._debugDrawSpline();
    }


    protected spline: geometry.Spline | null = null;

    protected _debugDrawSpline(): void
    {
        if (!EDITOR || !this.debugDraw)
        {
            return;
        }
        this.spline = new geometry.Spline();
        this.spline.setModeAndKnots(geometry.SplineMode.LINEAR, this._smoothPath);
        this._camera?.camera.geometryRenderer.addSpline(this.spline, Color.YELLOW);
    }
}


