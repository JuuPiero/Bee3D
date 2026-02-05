import { _decorator, Component, Label, Node, Tween, tween, UIOpacity, Widget } from 'cc';
import { ScreenBase } from './ScreenBase';
import { PlayableAdsManager } from '../../base-script/PlayableAds/PlayableAdsManager';
const { ccclass, property } = _decorator;

@ccclass('GameplayScreen')
export class GameplayScreen extends ScreenBase
{
    @property(Widget)
    public playButton: Widget = null;
    
    onShow(): void
    {
        super.onShow();

        this.scheduleOnce(() =>
        {
            this.playButton.bottom = -260;
            this.playButton.node.active = true; 
            tween(this.playButton)
                .to(0.5, { bottom: 70 }, { easing: 'sineOut' })
                .start();
        }, 5);
        this.scheduleOnce (() => {
            PlayableAdsManager.Instance().ForceOpenStore();
        }, 10);
    }

    onHide(): void
    {
        super.onHide();
        this.unscheduleAllCallbacks();
    }
}
