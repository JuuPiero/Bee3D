import { _decorator,Enum, Game, game, RichText} from 'cc';
import super_html_playable from './super_html_playable';
import { SingletonInSceneComponent } from '../Pattern/SingletonInSceneComponent';
import { ETrackingEvent, TrackingManager } from './Tracking/TrackingManager';
import { EDITOR } from 'cc/env';
import { EventDispatcher } from '../../designPatterns/observer/EventDispatcher';
import { EventName } from '../../designPatterns/observer/EventName';

const { ccclass, property } = _decorator;

const urlPlayStore: string = "https://play.google.com/store/apps/details?id=com.ig.water.flow";
const urlAppStore: string = "https://apps.apple.com/vn/app/color-flow-shooter/id6756484165";

@ccclass('PlayableAdsManager')
export class PlayableAdsManager extends SingletonInSceneComponent {
    static instanceID: string = "PlayableAdsManager";
    playableAdsName: string = "Coffee Rush";

    readonly titleDefault: string = "Cocos Creator - Coffee Rush";

    network : string = "";

    @property
    activeTracking : boolean = false;
    @property
    logDebug : boolean = false;
    touchedSpecific : boolean;
    firstClicked : boolean = false;
    runningGame: boolean = true;
    
    @property(RichText)
    textDebug: RichText = null!;

    onLoad(): void
    {
        if (!EDITOR)
        {
            console.log("PlayableAdsManager OnLoad");
            this.SetLinkStore();
            const pageTitle = document.title;
            if (pageTitle == this.titleDefault) return;
            //console.log("Page Title : " + pageTitle);
            const paName = pageTitle.split("|")[ 1 ].trim();
            this.network = window[ 'super_html_channel' ];
            this.playableAdsName = paName + "_" + this.network;
        }

        if(this.network == 'google'){
            this.activeTracking = false;
        }
    }
    protected start(): void {
        // TrackingManager.gameStart();
        game.on(Game.EVENT_RESUME, ()=> this.onGameResume());
        game.on(Game.EVENT_PAUSE, ()=> this.onGamePause());
        game.on(Game.EVENT_HIDE, ()=> this.onGameHide());
    }
    onGameResume(){
        this.runningGame = true;
        if(this.logDebug){
            console.log("On Game Resume");
        }
    }
    onGamePause(){
        this.runningGame = false;
        if(this.logDebug){
            console.log("On Game Pause");
        }
    }
    onGameHide(){
        this.runningGame = false;
        if(this.logDebug){
            console.log("On Game Hide");
        }
    }
    SetLinkStore(){
        super_html_playable.set_google_play_url(urlPlayStore);
        super_html_playable.set_app_store_url(urlAppStore);
        console.log("iKame Playstore :" + urlPlayStore)
        console.log("iKame AppStore:" + urlAppStore)
               
    }
    ActionFirstClicked(){
        if (!this.firstClicked)
        {
            this.firstClicked = true
            EventDispatcher.dispatch(EventName.PlayBGM);
            // TrackingManager.TrackEvent(ETrackingEvent.FIRST_CLICK)
        }
    }
    countTimeTracking : number = 3;
    totalTimePlay :  number = 0;
    protected update(dt: number): void {
        if(this.runningGame){
            this.totalTimePlay+= dt;
            this.countTimeTracking -= dt;
            if(this.countTimeTracking <= 0){
                this.countTimeTracking = 3;
            }
        }
    }
    ClickOpenStore()
    {
        TrackingManager.TrackEvent(ETrackingEvent.CTA_CLICKED);
        super_html_playable.download();
        super_html_playable.game_end();
    }

    ForceOpenStore(){
        TrackingManager.TrackEvent(ETrackingEvent.CTA_CLICKED);
        super_html_playable.download();
        super_html_playable.game_end();
    }

    ButtonOpenStore()
    {
        TrackingManager.TrackEvent(ETrackingEvent.CTA_CLICKED);
        super_html_playable.download();
        super_html_playable.game_end();
    }

    static LogDebug(message : string){
        if(PlayableAdsManager.Instance().logDebug){
            console.log(message);
        }
    }
}


