import { CacheSlot } from "./CacheSlot";

export interface ICacheSlotController 
{
    getSlotAtIndex(index: number): CacheSlot | null;
    getNextEmptySlot(): CacheSlot | null
}


