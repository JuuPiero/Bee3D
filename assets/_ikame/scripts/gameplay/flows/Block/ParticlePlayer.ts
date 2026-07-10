import { _decorator, Color, Component, Node, ParticleAsset, ParticleSystem } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ParticlePlayer')
export class ParticlePlayer extends Component {
    

    @property([ParticleSystem]) private vfxs: ParticleSystem[] = []
    
    public play()
    {
        for (let i = 0; i < this.vfxs.length; i++)
        {
            this.vfxs[i].stop();
            this.vfxs[i].clear();
            this.vfxs[i].play();
        }
    }

    public setColor(color: Color)
    {
        for (let i = 0; i < this.vfxs.length; i++) {
            this.vfxs[i].startColor.color = color
        }
    }
}


