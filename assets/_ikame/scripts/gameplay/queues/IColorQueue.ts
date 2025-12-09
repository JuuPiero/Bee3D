import { ShooterItem } from "../flows/ShooterItem/ShooterItem";

export interface IColorQueue
{
    isOnTop(shooter: ShooterItem): boolean;
    removeShooter(shooter: ShooterItem): boolean;
}