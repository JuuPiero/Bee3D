import { _decorator, AudioSource, Component, easing, Label, Node, tween, Tween, Vec3 } from 'cc';
import { EventDispatcher } from '../designPatterns/observer/EventDispatcher';
import { EventName } from '../designPatterns/observer/EventName';
import { LevelDataConfig } from '../data/levelData/LevelDataConfig';
const { ccclass, property } = _decorator;

@ccclass('TimerView')
export class TimerView extends Component {

    @property(Label) timeLabel: Label;

    @property(AudioSource)
    tickAudio: AudioSource;
        
    start() {
        EventDispatcher.addListener(EventName.EndGame, this.hide, this);
    }

    protected onDestroy(): void
    {
        EventDispatcher.removeListener(EventName.EndGame, this.hide, this);
    }

    update(deltaTime: number) {
        
    }

    public hide(): void 
    {
        this.tickAudio.stop();
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.25, { position: new Vec3(0, 1200, 0) }, { easing: easing.backIn })
            .start();
    }

    public show(): void 
    {
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.25, { position: new Vec3(0, 895, 0) }, { easing: easing.sineOut })
            .start();
    }

    public setTime(second: number)
    {
        const min = Math.floor(second / 60);
        const sec = Math.floor(second % 60);
        const secStr = sec < 10 ? "0" + sec : sec
        const str = `${min}:${secStr}`;
        this.timeLabel.string = str;

        if (second === 10)
        {
            this.tickAudio.play();
        }
    }
}


