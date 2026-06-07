export type RecordingState = "idle" | "recording" | "stopped";
export declare function useVoiceRecorder(): {
    state: RecordingState;
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<Blob>;
};
//# sourceMappingURL=useVoiceRecorder.d.ts.map