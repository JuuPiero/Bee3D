import { _decorator, AudioClip, Component, Node, ParticleSystem } from 'cc';
import { ScreenBase } from './ScreenBase';
import { EventName } from '../../designPatterns/observer/EventName';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
const { ccclass, property } = _decorator;

@ccclass('TransitionScreen')
export class TransitionScreen extends ScreenBase {
    
    @property(AudioClip) transitionSound: AudioClip = null;

    @property([ ParticleSystem ])
    public transitionParticles: ParticleSystem[] = [];

    onShow(): void
    {
        super.onShow();
        EventDispatcher.dispatch(EventName.PlaySFX, this.transitionSound);

        for (let i = 0; i < this.transitionParticles.length; i++)
        {
            this.transitionParticles[ i ].stop();
            this.transitionParticles[ i ].clear();
            this.transitionParticles[i].play();
        }
    }
}


