interface StreamCallbacks {
    workletPath: string;
    onUserTranscript?: (text: string) => void;
    onTranscript?: (text: string, full: string) => void;
    onComplete?: (transcript: string) => void;
    onError?: (error: Error) => void;
}
export declare function useVoiceStream({ workletPath, ...callbacks }: StreamCallbacks): {
    streamVoiceResponse: (url: string, audioBlob: Blob) => Promise<void>;
    playbackState: import("./useAudioPlayback").PlaybackState;
};
export {};
//# sourceMappingURL=useVoiceStream.d.ts.map