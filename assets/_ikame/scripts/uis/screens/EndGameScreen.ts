import { _decorator, AudioClip, Component, Node } from 'cc';
import { ScreenBase } from './ScreenBase';
import { ETrackingEvent, TrackingManager } from '../../base-script/PlayableAds/Tracking/TrackingManager';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../designPatterns/observer/EventName';
import { PlayableAdsManager } from '../../base-script/PlayableAds/PlayableAdsManager';
const { ccclass, property } = _decorator;

const ALLOW_REPLAY = true;

@ccclass('EndGameScreen')
export class EndGameScreen extends ScreenBase {

    @property(AudioClip)
    public lostSFX: AudioClip = null

    @property(Node)
    public replayButton: Node = null;

    @property(Node)
    public openStoreButton: Node = null;
        
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

        this.replayButton.active = ALLOW_REPLAY;
        this.openStoreButton.active = !ALLOW_REPLAY;
    }

    protected onDisable(): void
    {
        this.node.off(Node.EventType.TOUCH_START, this.onTouch, this);
    }

    private onTouch()
    {
        PlayableAdsManager.Instance().ClickOpenStore();
    }
}


