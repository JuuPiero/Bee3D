import { EDITOR, PREVIEW } from 'cc/env';

export enum ETrackingEvent {
    LOADING = 'LOADING',
    LOADED = 'LOADED',
    DISPLAYED = 'DISPLAYED',
    CHALLENGE_STARTED = 'CHALLENGE_STARTED',
    CHALLENGE_FAILED = 'CHALLENGE_FAILED',
    CHALLENGE_RETRY = 'CHALLENGE_RETRY',
    CHALLENGE_PASS_25 = 'CHALLENGE_PASS_25',
    CHALLENGE_PASS_50 = 'CHALLENGE_PASS_50',
    CHALLENGE_PASS_75 = 'CHALLENGE_PASS_75',
    CHALLENGE_SOLVED = 'CHALLENGE_SOLVED',
    COMPLETED = 'COMPLETED',
    CTA_CLICKED = 'CTA_CLICKED',
    ENDCARD_SHOWN = 'ENDCARD_SHOWN',

    FIRST_CLICK = 'FIRST_CLICK',
    CLICK_CONVERTION = 'CLICK_CONVERTION',
    FORCE_CONVERTION = 'FORCE_CONVERTION',
    TIME_OUT = 'TIME_OUT'
}

export class TrackingManager {
    static TrackEvent(nameEvent: string) {

        if (PREVIEW || EDITOR)
        {
            console.log("Tracking Event:", nameEvent);
        }

        //@ts-ignore
        if (typeof window.ALPlayableAnalytics != 'undefined') {
            //@ts-ignore
            window.ALPlayableAnalytics.trackEvent(nameEvent);
        }
    }
    //#endregion
}
