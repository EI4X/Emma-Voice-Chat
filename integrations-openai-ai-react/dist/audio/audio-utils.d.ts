/**
 * Audio utility functions for voice chat.
 * Handles PCM16 decoding and AudioContext initialization.
 */
/**
 * Decode base64 PCM16 audio to Float32Array for Web Audio API
 */
export declare function decodePCM16ToFloat32(base64Audio: string): Float32Array;
/**
 * Create and initialize AudioContext with worklet
 */
export declare function createAudioPlaybackContext(workletPath: string, sampleRate?: number): Promise<{
    ctx: AudioContext;
    worklet: AudioWorkletNode;
}>;
//# sourceMappingURL=audio-utils.d.ts.map