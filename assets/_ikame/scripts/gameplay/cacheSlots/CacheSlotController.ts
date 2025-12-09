import { _decorator, Component, Node } from 'cc';
import { ICacheSlotController } from './ICacheSlotController';
import { CacheSlot } from './CacheSlot';
const { ccclass, property } = _decorator;

const QUEUE_GAP = 2;

@ccclass('CacheSlotController')
export class CacheSlotController extends Component implements ICacheSlotController {
    
    private _cacheSlots: CacheSlot[] = [];
    private _activeSlots: CacheSlot[] = [];

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
                i > 0 ? this._activeSlots[i - 1] : null
            );
        }
    }
}


