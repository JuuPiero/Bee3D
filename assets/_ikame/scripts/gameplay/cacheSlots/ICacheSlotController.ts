import { Vec3 } from "cc";
import { IShooterItem } from "../flows/ShooterItem/IShooterItem";

export interface ICacheSlotController 
{
    getNextEmptyPosition(): Vec3 | null
    addToCache(shooter: IShooterItem): boolean;
    removeFromCache(shooter: IShooterItem): boolean;
    compactCache(): void 
}


