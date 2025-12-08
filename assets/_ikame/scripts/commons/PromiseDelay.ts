import { Component, find, _decorator } from "cc";
const { ccclass } = _decorator;

@ccclass('PromiseDelay')
export class PromiseDelay extends Component
{
    private static Instance: PromiseDelay;

    static Wait(second: number): Promise<void>
    {
        return new Promise(resolve => {
            this.GetInstance().scheduleOnce(() => {
                resolve();
            }, second);
        });
    }

    private static GetInstance(): PromiseDelay
    {
        if (!this.Instance)
        {
            this.Instance = find("PromiseDelay").getComponent(PromiseDelay);
        }
        return this.Instance;
    }

    protected onLoad(): void
    {
        PromiseDelay.Instance = this;
    }
}


