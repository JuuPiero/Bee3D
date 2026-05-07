import { Quat, Vec3 } from "cc";

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