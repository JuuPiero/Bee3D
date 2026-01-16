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

    private _inSlotShooters: Set<IShooterItem> = new Set<IShooterItem>();
    private _maxSlotCount: number = 0;


    protected onLoad(): void
    {
        this._cacheSlots = this.getComponentsInChildren<CacheSlot>(CacheSlot);
    }

    init(slotCount : number): void
    {
        this._inSlotShooters.clear();

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
        if (this._inSlotShooters.size >= this._maxSlotCount)
            return false;

        this._inSlotShooters.add(shooter);
        return true;
    }

    public removeFromCache(shooter: IShooterItem): boolean
    {
        shooter.setCacheSlotIndex(-1);
        if (this._inSlotShooters.has(shooter))
        {
            this._inSlotShooters.delete(shooter);
            return true;
        }
        return false;
    }
    

    protected update(dt: number): void
    {
        let index = 0;
        for (const shooter of this._inSlotShooters)
        {
            shooter.shuffleToCacheUpdate(dt, this._activeSlots[ index ].node.worldPosition, index);
            index++;
        }
    }

    public compactCache(): void 
    {
        let index = 0;
        for (const shooter of this._inSlotShooters)
        {
            // shooter.shuffleToCache(this._activeSlots[ index ].node.worldPosition, index);
            shooter.setCacheSlotIndex(index);
            index++;
        }
    }

    public getNextEmptyPosition(): Vec3 | null
    {
        const filledCount = this._inSlotShooters.size;
        if (filledCount >= this._activeSlots.length)
            return null;
        return this._activeSlots[filledCount].node.worldPosition;
    }
}


