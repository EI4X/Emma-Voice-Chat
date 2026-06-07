export type PlaybackState = "idle" | "playing" | "ended";
export declare function useAudioPlayback(workletPath: string): {
    state: PlaybackState;
    init: () => Promise<void>;
    pushAudio: (base64Audio: string) => void;
    pushSequencedAudio: (seq: number, base64Audio: string) => void;
    signalComplete: () => void;
    clear: () => void;
};
//# sourceMappingURL=useAudioPlayback.d.ts.map