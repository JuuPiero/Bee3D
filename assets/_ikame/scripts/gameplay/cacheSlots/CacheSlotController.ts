import { _decorator, Component, Node, Vec3 } from 'cc';
import { ICacheSlotController } from './ICacheSlotController';
import { CacheSlot } from './CacheSlot';
import { IShooterItem } from '../flows/ShooterItem/IShooterItem';
const { ccclass, property } = _decorator;

const QUEUE_GAP = 1.32;

@ccclass('CacheSlotController')
export class CacheSlotController extends Component implements ICacheSlotController {
    
    private _cacheSlots: CacheSlot[] = [];
    private _activeSlots: CacheSlot[] = [];

    private _inSlotShooters: IShooterItem[] = [];
    private _maxSlotCount: number = 0;


    protected onLoad(): void
    {
        this._cacheSlots = this.getComponentsInChildren<CacheSlot>(CacheSlot);
    }

    init(slotCount : number): void
    {
        this._maxSlotCount = slotCount;
        this._activeSlots = [];
        for (let i = 0; i < this._cacheSlots.length; i++) 
        {
            const slot = this._cacheSlots[i];
            const isActive = i < slotCount;
            slot.node.active = isActive;
            if (isActive) {
                this._activeSlots.push(slot);
            }
        }

        // Center-align active slots horizontally similar to ColorQueueControllers
        const offsetX = -((this._activeSlots.length - 1) * QUEUE_GAP) / 2;
        for (let i = 0; i < this._activeSlots.length; i++)
        {
            const slot = this._activeSlots[i];
            slot.node.setPosition(i * QUEUE_GAP + offsetX, 0, 0);
            slot.init(this,
                i < this._activeSlots.length - 1 ? this._activeSlots[i + 1] : null,
                i > 0 ? this._activeSlots[ i - 1 ] : null,
                i
            );
        }
    }

    /**
     * Finds the next empty slot from left to right starting at index 0.
     * Returns the `CacheSlot` if found, otherwise `null`.
     */
    getNextEmptySlot(): CacheSlot | null
    {
        for (let i = 0; i < this._activeSlots.length; i++)
        {
            const slot = this._activeSlots[i];
            if (slot.isEmpty())
            {
                return slot;
            }
        }
        return null;
    }

    getSlotAtIndex(index: number): CacheSlot | null
    {
        if (index < 0 || index >= this._activeSlots.length)
            return null;
        return this._activeSlots[index];
    }

    public addToCache(shooter: IShooterItem): boolean
    {
        if (this._inSlotShooters.length >= this._maxSlotCount)
            return false;

        this._inSlotShooters.push(shooter);
        this.compactCache();
        return true;
    }

    public removeFromCache(shooter: IShooterItem): boolean
    {
        console.log("Removing shooter from cache slot");
        const index = this._inSlotShooters.indexOf(shooter);
        shooter.setCacheSlotIndex(-1);
        if (index !== -1)
        {
            this._inSlotShooters.splice(index, 1);
            this.compactCache();
            return true;
        }
        return false;
    }
    

    public compactCache(): void 
    {
        let index = 0;
        console.log("Compacting cache slots", this._inSlotShooters.length);
        for (const shooter of this._inSlotShooters)
        {
            shooter.shuffleToCache(this._activeSlots[ index ].node.worldPosition, index);
            shooter.setCacheSlotIndex(index);
            index++;
        }
    }

    public getNextEmptyPosition(): Vec3 | null
    {
        const filledCount = this._inSlotShooters.length;
        if (filledCount >= this._activeSlots.length)
            return null;
        return this._activeSlots[filledCount].node.worldPosition;
    }
}


