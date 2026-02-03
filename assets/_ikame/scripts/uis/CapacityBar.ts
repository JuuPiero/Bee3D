import { _decorator, Color, Component, easing, Label, Node, ProgressBar, Sprite, tween, Tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CapacityBar')
export class CapacityBar extends Component {
    @property(ProgressBar)
    public progressBar: ProgressBar;

    @property(Sprite)
    public fillSprite: Sprite;

    @property(Label)
    public label: Label;

    @property(Color)
    public color1: Color = new Color();

    @property(Color)
    public color2: Color = new Color();

    private _color = new Color();

    protected start(): void
    {
        this.fillSprite.color = this.color1;
    }

    public setProgress(amount: number, max: number)
    {
        let p = amount / max;
        this.label.string = `${amount}/${max}`; 
        Color.lerp(this._color, this.color1, this.color2, easing.sineIn(p));
        this.fillSprite.color = this._color;
        Tween.stopAllByTarget(this.progressBar);
        tween(this.progressBar)
            .to(0.3, { progress: p })
            .start();
    }
}


