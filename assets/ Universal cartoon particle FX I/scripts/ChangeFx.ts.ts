import { _decorator, Component, EventKeyboard, input, Input, instantiate, KeyCode, Node, ParticleSystem, Prefab } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ChangeFx')
export class ChangeFx extends Component {

    @property({type: Prefab})
    effects: Prefab[] = []

    private _index: number = 0;
    private _currentEffect: Node = null;

    onLoad() {
        this._currentEffect = instantiate(this.effects[this._index]);
        this.node.addChild(this._currentEffect);

        input.on(Input.EventType.KEY_DOWN, this.onKeyUp, this);
    }
    
    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyUp, this);
    }
    start() {

    }

    onPlayClick() {
        
        if (this._currentEffect) {
            this._currentEffect.removeFromParent();
        }

        this._currentEffect = instantiate(this.effects[this._index]);
        this.node.addChild(this._currentEffect);
    }

    onPrevClick() {
        this._index--;
        if (this._index <= 0) {
            this._index = this.effects.length - 1;
        }

        if (this._currentEffect) {
            this._currentEffect.removeFromParent();
        }

        this._currentEffect = instantiate(this.effects[this._index]);
        this.node.addChild(this._currentEffect);
    }

    onNextClick() {
        this._index++;
        if (this._index >= this.effects.length) {
            this._index = 0;
        }

        if (this._currentEffect) {
            this._currentEffect.removeFromParent();
        }

        this._currentEffect = instantiate(this.effects[this._index]);
        this.node.addChild(this._currentEffect);
    }

    onKeyUp(event: EventKeyboard) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT:
                this.onPrevClick();
                break;
            case KeyCode.ARROW_RIGHT:
                this.onNextClick();
                break;
            case KeyCode.SPACE:
                this.onPlayClick();
                break;
            case KeyCode.ARROW_UP:
                this.onPrevClick();
                break;
            case KeyCode.ARROW_DOWN:
                this.onNextClick();
                break;
            default:
                break;
        }
    }


    update(deltaTime: number) {
        
    }
}


