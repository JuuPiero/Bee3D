import { math, Quat, Vec3 } from "cc";

export abstract class Utils {
    private static readonly WORLD_FORWARD = new Vec3(0, 0, 1);
    
    public static generateKeyFromCoord(x: number, z: number): string {
        return `${x}|${z}`;
    }    

    public static clampAngle(angle: number) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle
    }

    public static getDeltaEuler (curPos: Vec3, targetPos: Vec3, curEulerY : number): number {
        const direction = Vec3.subtract(new Vec3(),  curPos, targetPos,).normalize();
        const quat = Quat.fromViewUp(new Quat(), direction);
        const euler = new Vec3();
        quat.getEulerAngles(euler);
        const from = this.clampAngle(curEulerY);
        const to = this.clampAngle(euler.y);
        return to - from;
    }


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