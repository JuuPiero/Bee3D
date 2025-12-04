export abstract class Utils {
    
    public static generateKeyFromCoord(x: number, z: number): string {
        return `${x}|${z}`;
    }    
}