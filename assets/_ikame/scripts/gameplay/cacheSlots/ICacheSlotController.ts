import { CacheSlot } from "./CacheSlot";

export interface ICacheSlotController 
{

    getNextEmptySlot(): CacheSlot | null
}


