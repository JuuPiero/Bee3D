import { _decorator, AudioClip, AudioSource, Component, Node } from 'cc';
import { EventName } from '../designPatterns/observer/EventName';
import { EventDispatcher } from '../designPatterns/observer/EventDispatcher';
const { ccclass, property } = _decorator;

@ccclass('AudioController')
export class AudioController extends Component {
    @property( AudioSource )
    public sfx: AudioSource

    @property(AudioSource)
    public bgm: AudioSource = null

    @property(AudioClip)
    public bgmClip: AudioClip = null

    protected onEnable(): void
    {
        EventDispatcher.addListener(EventName.PlaySFX, this.onPlaySFX, this);
        // EventDispatcher.addListener(EventName.PlayBGM, this.onPlayBGM, this);
        // EventDispatcher.addListener(EventName.ToggleBGM, this.toggleBGM, this);
    }

    onPlaySFX(clip: AudioClip, vol: number = 1)
    {
        this.sfx.playOneShot(clip, vol);
    }

    playBGM()
    {
        this.bgm.clip = this.bgmClip;
        this.bgm.play();
        this.bgm.loop = true;
    }

    private onPlayBGM()
    {
        this.playBGM();
    }

    protected onDisable(): void
    {
        EventDispatcher.removeListener(EventName.PlaySFX, this.onPlaySFX, this);
        // EventDispatcher.removeListener(EventName.PlayBGM, this.onPlayBGM, this);
        // EventDispatcher.removeListener(EventName.ToggleBGM, this.toggleBGM, this);
    }

    private toggleBGM()
    {
        if(this.bgm.playing){
            this.bgm.stop();
        }
        else{
            this.playBGM();
        }
    }
}


