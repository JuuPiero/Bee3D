import { _decorator, Component, Node } from 'cc';
import { ICacheSlotController } from './ICacheSlotController';
import { CacheSlot } from './CacheSlot';
import { IShooterItem } from '../flows/ShooterItem/IShooterItem';
const { ccclass, property } = _decorator;

const QUEUE_GAP = 1.32;

@ccclass('CacheSlotController')
export class CacheSlotController extends Component implements ICacheSlotController {
    
    private _cacheSlots: CacheSlot[] = [];
    private _activeSlots: CacheSlot[] = [];

    private _inSlotShooters : IShooterItem[] = [];


    protected onLoad(): void
    {
        this._cacheSlots = this.getComponentsInChildren<CacheSlot>(CacheSlot);
    }

    init(slotCount : number): void
    {
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

    /**
     * Compacts the active slots by shifting items towards index 0.
     * This removes gaps by moving right-side items left into empty slots.
     */
    compactLeft(): void
    {
        this._inSlotShooters = [];
        for (let i = 0; i < this._activeSlots.length - 1; i++)
        {
            const currentSlot = this._activeSlots[ i ];
            if (!currentSlot.getShooter())
                continue;
            currentSlot.removeShooter();
            this._inSlotShooters.push( currentSlot.getShooter() as IShooterItem );
        }
        for (let i = 0; i < this._inSlotShooters.length; i++)
        {
            const shooter = this._inSlotShooters[ i ];
            const slot = this._activeSlots[ i ];
            slot.setShooter(shooter);
            shooter.setCacheSlot(i, true);
        }
    }

    getSlotAtIndex(index: number): CacheSlot | null
    {
        if (index < 0 || index >= this._activeSlots.length)
            return null;
        return this._activeSlots[index];
    }
    
}


