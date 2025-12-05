import { _decorator, CCBoolean, CCFloat, Component, Node } from 'cc';
import { SplineFollower } from './SplineFollower';
const { ccclass, property } = _decorator;

const FIXED_PATH_LENGTH = 1;

@ccclass('SplineFollowerSpeed')
export class SplineFollowerSpeed extends SplineFollower {

    @property(CCFloat) protected speed: number = 1;

    @property(CCBoolean) protected isLooping: boolean = false;

    private _oldProgress: number = 0;

    protected onLoad(): void
    {
        this._oldProgress = this.progress;
    }

    protected update(deltaTime: number) 
    {
        this.updatePosition(deltaTime);
    }

    protected updatePosition(deltaTime: number): void
    {
        const pathLength = this.spline.getPathLength();
        const speedFactor =  pathLength / FIXED_PATH_LENGTH;
        const newSpeed = this.speed / speedFactor;
        this.progress += deltaTime * newSpeed;
        if (this.isLooping)
        {
            this.progress = this.progress % 1;   
            if (this.progress < this._oldProgress)
            {
                this.onCompleteLoop();
            }
        }
        else 
        {
            this.progress = Math.min(this.progress, 1);
            if (this.progress >= 1)
            {
                this.onCompleteLoop();
            }
        }
            
        this._oldProgress = this.progress;
        this.setProgress(this.progress);
    }

    public onCompleteLoop(): void
    {

    }
}


