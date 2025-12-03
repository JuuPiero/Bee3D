import { _decorator, CCFloat, Component, Node } from 'cc';
import { SplineFollower } from './SplineFollower';
const { ccclass, property } = _decorator;

const FIXED_PATH_LENGTH = 1;

@ccclass('SplineFollowerSpeed')
export class SplineFollowerSpeed extends SplineFollower {

    @property(CCFloat) protected speed: number = 1;

    protected update(deltaTime: number) 
    {
        this.updatePosition(deltaTime);
    }

    protected updatePosition(deltaTime: number): void
    {
        const pathLength = this.spline.getPathLength();
        const speedFactor =  pathLength / FIXED_PATH_LENGTH;
        const newSpeed = this.speed / speedFactor;
        this.progress += newSpeed * deltaTime;
        this.progress = this.progress % 1;
        this.setPrgogress(this.progress);
    }
}


