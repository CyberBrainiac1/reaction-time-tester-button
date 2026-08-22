export type TrialState = 'disconnected'|'connecting'|'ready'|'waiting'|'go'|'result'|'false-start'|'error'
export type Source = 'hardware'|'simulator'
export interface TrialResult { trialNumber:number; reactionTimeMs:number|null; falseStart:boolean; stimulusTimestampMs:number|null; pressReceivedTimestampMs:number; arduinoPressMicros:number|null; dateTime:string; source:Source; valid:boolean; invalidReason?:string }
export interface SerialEvent { type:'READY'|'PONG'|'ARMED'|'PRESS'|'RELEASE'|'ERROR'|'MALFORMED'; micros?:number; message?:string; raw:string; receivedAt:number }

