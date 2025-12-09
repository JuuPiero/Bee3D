import { Tween, Widget } from 'cc';
import { UIOpacity } from 'cc';
import { _decorator, Component, Node, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TweenMove')
export class TweenMove extends Component {
    @property
    initPosition : Vec3 = new Vec3(0,0,0)
    @property
    moveTo : Vec3 = new Vec3(0,0,0);
    @property
    delay : number = 0;
    @property
    duration : number = 1;
    
    @property
    repeatForever : boolean = false;

    onEnable() {
        this.ActionTween();
    }

    protected onDisable(): void {
        // Stop the tween when the component is disabled
        Tween.stopAllByTarget(this.node);
    }

    ActionTween(){
        // if(this.node.getComponent(Widget) != null){
        //     this.node.getComponent(Widget).enabled = false;
        // }
        if(!this.repeatForever){
            tween(this.node)
            .set( {position: this.initPosition})
            .delay(this.delay)
            .to(this.duration, {position: this.moveTo} , {easing: "backOut"})
            .call(()=>{
                // if(this.node.getComponent(Widget) != null){
                //     this.node.getComponent(Widget).enabled = true;
                // }  
            })
            .start();
        }else{
            tween(this.node)
            .set( {position: this.initPosition})
            .delay(this.delay)
            .to(this.duration, {position: this.moveTo} , {easing: "backOut"})
            .union()
            .repeatForever()
            .start();
            var uiOpacity = this.node.getComponent(UIOpacity);
            if( uiOpacity != null){
                tween(uiOpacity)
                .set( {opacity : 255})
                .delay(this.delay)
                .to(this.duration, {opacity: 0} , {easing: "backOut"})
                .union()
                .repeatForever()
                .start();
            }
        }
    }

    BackTween(){
        tween(this.node)
        .set( {position: this.moveTo})
        .to(.5, {position: this.initPosition} , {easing: "quartIn"})
        .start();
    }
}


