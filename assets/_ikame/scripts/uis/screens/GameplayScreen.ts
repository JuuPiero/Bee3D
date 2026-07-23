import { _decorator, Color, Component, director, game, Label, Node, Sprite, Tween, tween, UIOpacity, Widget } from 'cc';
import { ScreenBase } from './ScreenBase';
import { PlayableAdsManager } from '../../base-script/PlayableAds/PlayableAdsManager';
import { TO_STORE_AFTER_PLAYNOW } from 'cc/userland/macro';
const { ccclass, property } = _decorator;

const GRAY_COLOR : Color = new Color(165, 165, 165, 255);
@ccclass('GameplayScreen')
export class GameplayScreen extends ScreenBase
{
    @property(Widget)
    public playButton: Widget = null;

    @property(Node) public speedX2Button: Node;

    private _isX2Speed: boolean = false;

    protected onEnable(): void {
        this.speedX2Button.on(Node.EventType.TOUCH_START, this.onX2SpeedClick, this);
        this.speedX2Button.getComponent(Sprite).color = this._isX2Speed ? Color.WHITE : GRAY_COLOR 
    }

    protected onDisable(): void {
        this.speedX2Button.off(Node.EventType.TOUCH_START, this.onX2SpeedClick, this);
    }

    private onX2SpeedClick()
    {
        this._isX2Speed = !this._isX2Speed;
        director.getScheduler().setTimeScale(this._isX2Speed ? 3 : 1);
        this.speedX2Button.getComponent(Sprite).color = this._isX2Speed ? Color.WHITE : GRAY_COLOR
    }
    
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
        if (TO_STORE_AFTER_PLAYNOW)
        {
            this.scheduleOnce (() => {
                PlayableAdsManager.Instance().ForceOpenStore();
            }, 10);
        }
    }

    onHide(): void
    {
        super.onHide();
        this.unscheduleAllCallbacks();
    }
}
