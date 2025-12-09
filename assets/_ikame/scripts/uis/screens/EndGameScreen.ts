import { _decorator, AudioClip, Component, Node } from 'cc';
import { ScreenBase } from './ScreenBase';
import { ETrackingEvent, TrackingManager } from '../../base-script/PlayableAds/Tracking/TrackingManager';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../designPatterns/observer/EventName';
import { PlayableAdsManager } from '../../base-script/PlayableAds/PlayableAdsManager';
const { ccclass, property } = _decorator;

@ccclass('EndGameScreen')
export class EndGameScreen extends ScreenBase {

    @property(AudioClip)
    public lostSFX: AudioClip = null
        
    onShow(): void 
    {
        EventDispatcher.dispatch(EventName.PlaySFX, this.lostSFX);
        TrackingManager.TrackEvent(ETrackingEvent.ENDCARD_SHOWN);    
    }

    replayGame(): void 
    {
        // this.unschedule(this.toStoreForce);
        EventDispatcher.dispatch(EventName.ReplayGame);
    }

    protected onEnable(): void
    {
        this.node.on(Node.EventType.TOUCH_START, this.onTouch, this);
    }

    protected onDisable(): void
    {
        this.node.on(Node.EventType.TOUCH_START, this.onTouch, this);
    }

    private onTouch()
    {
        PlayableAdsManager.Instance().ClickOpenStore();
    }
}


