import { _decorator, AudioClip, Node } from 'cc';
import { ScreenBase } from './ScreenBase';
import { ETrackingEvent, TrackingManager } from '../../base-script/PlayableAds/Tracking/TrackingManager';
import { EventName } from '../../designPatterns/observer/EventName';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { PlayableAdsManager } from '../../base-script/PlayableAds/PlayableAdsManager';
const { ccclass, property } = _decorator;

@ccclass('WinGameScreen')
export class WinGameScreen extends ScreenBase
{

    @property(AudioClip)
    public winSFX: AudioClip = null

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

    onShow(): void
    {
        EventDispatcher.dispatch(EventName.PlaySFX, this.winSFX);
        TrackingManager.TrackEvent(ETrackingEvent.ENDCARD_SHOWN);
    }
}


