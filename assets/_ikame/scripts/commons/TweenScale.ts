import { _decorator, Component, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TweenScale')
export class TweenScale extends Component {
    @property
    initScale : Vec3 = new Vec3(0,0,0)
    @property
    scaleTo : Vec3 = new Vec3(0,0,0);
    @property
    duration : number = 1;
    
    @property
    delay : number = 0;

    @property
    repeatForever: boolean = false;

    protected onLoad(): void
    {
    }

    protected onDisable(): void
    {
        // Stop the tween when the component is disabled
        Tween.stopAllByTarget(this.node);
    }

    protected onDestroy(): void
    {
        // Stop the tween when the component is destroyed
        Tween.stopAllByTarget(this.node);
    }
    
    protected onEnable() {
        this.ActionTween();
    }

    ActionTween(){
        // Set initial scale first
        this.node.setScale(this.initScale);
        
        if(!this.repeatForever){
            tween(this.node)
            .to(this.duration, {scale: this.scaleTo} , {easing: "backOut"})
            .call(()=>{
                tween(this.node)
                //.to(this.duration, {scale: Vec3.ONE} , {easing: "smooth"})
                .to(this.duration, {scale: this.scaleTo} , {easing: "smooth"})
                .to(this.duration, {scale : this.scaleTo} , {easing: "smooth"})
                .union()
                .repeatForever()
                .start();
            })
            .start();
        }else{
            let currentScale = this.node.getScale();
            
            // Set initial scale first
            this.node.setScale(new Vec3(this.initScale.x * currentScale.x, this.initScale.y * currentScale.y, this.initScale.z * currentScale.z));

            tween(this.node)
            .to(this.duration, {scale: new Vec3(this.scaleTo.x * currentScale.x, this.scaleTo.y * currentScale.y, this.scaleTo.z * currentScale.z)} , {easing: "linear"})
            .to(this.duration, {scale: this.initScale} , {easing: "linear"})
            .delay(this.delay)
            .union()
            .repeatForever()
            .start();
        }
    }
}


