import { _decorator, Camera, Component, EventTouch, input, Input, Label, Node, Tween, UITransform, Vec3 } from 'cc';
import { ScreenBase } from './ScreenBase';
import { PlayableAdsManager } from '../../base-script/PlayableAds/PlayableAdsManager';
import { EventName } from '../../designPatterns/observer/EventName';
import { EGameState } from '../../designPatterns/stateMachine/EGameState';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { LevelController } from '../../gameplay/controllers/LevelController';
import { ETrackingEvent, TrackingManager } from '../../base-script/PlayableAds/Tracking/TrackingManager';

const { ccclass, property } = _decorator;

@ccclass('IdleScreen')
export class IdleScreen extends ScreenBase 
{
    @property(LevelController)
    public levelController: LevelController = null;

    @property(Camera)
    public mainCamera: Camera = null;

    @property(Node)
    public canvasNode: Node = null;

    @property(Node)
    public tutorialHand: Node = null;

    protected onEnable(): void
    {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.tutorialHand.active = false;
    }

    onShow(): void
    {
        const tutWorldPos = this.levelController.getTutorialPosition();
        const uiPos = this.mainCamera.convertToUINode(tutWorldPos, this.canvasNode);
        this.tutorialHand.setPosition(uiPos)
        console.log(uiPos);
        this.tutorialHand.active = true;
    }

    private onTouchStart(event: EventTouch): void
    {
        PlayableAdsManager.Instance().ActionFirstClicked();
        EventDispatcher.dispatch(EventName.ChangeGameState, EGameState.Gameplay)
    }

    public onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    }

}


