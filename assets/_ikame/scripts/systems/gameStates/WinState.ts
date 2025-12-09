import { Input, input } from "cc";
import { GameStateBase } from "./GameStateBase";
import { PlayableAdsManager } from "../../base-script/PlayableAds/PlayableAdsManager";
import { PromiseDelay } from "../../commons/PromiseDelay";


export class WinState extends GameStateBase
{
    public onEnter(): void {
        super.onEnter();
        this.toStore();

    }

    public onExit(): void
    {
    }

    private onTouchEnd(): void
    {
        PlayableAdsManager.Instance().ClickOpenStore();
    }

    async toStore(): Promise<void>  
    {
        await PromiseDelay.Wait(5);    
        PlayableAdsManager.Instance().ForceOpenStore();
    }
}


