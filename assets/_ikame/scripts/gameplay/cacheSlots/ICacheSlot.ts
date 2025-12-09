import { IShooterItem } from "../flows/ShooterItem/IShooterItem";

export interface ICacheSlot {
    getLeftSlot() : ICacheSlot | null;
    getRightSlot(): ICacheSlot | null;
    setShooter(shooter: IShooterItem);
    getShooter(): IShooterItem | null;
    removeShooter(): IShooterItem | null;
}


