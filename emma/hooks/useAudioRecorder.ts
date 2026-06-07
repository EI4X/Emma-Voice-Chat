import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { acquireMicStream, getSharedMicStream } from "@/lib/micStream";

async function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webRecordingStreamRef = useRef<MediaStream | null>(null);
  const webChunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    // ── Web path: reuse shared stream acquired in user gesture ────────────────
    if (Platform.OS === "web") {
      try {
        // Prefer already-acquired shared stream; fall back to acquireMicStream
        const stream = getSharedMicStream() ?? await acquireMicStream();
        if (!stream) throw new Error("Microphone unavailable");
        webRecordingStreamRef.current = stream;

        // Pick best supported MIME type
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : null;

        const mr = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        webChunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data.size > 0) webChunksRef.current.push(e.data); };
        mr.start(100);
        webMediaRecorderRef.current = mr;
        setIsRecording(true);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : (err as any)?.name ?? String(err);
        console.error("[useAudioRecorder] web startRecording failed:", msg);
        return false;
      }
    }

    // ── Native path ────────────────────────────────────────────────────────────
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) return false;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          android: {
            extension: ".m4a",
            outputFormat: 2,
            audioEncoder: 3,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: ".m4a",
            outputFormat: "aac " as any,
            audioQuality: 127,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: "audio/webm",
            bitsPerSecond: 128000,
          },
        },
        (status) => {
          if (status.isRecording && status.metering != null) {
            const norm = Math.max(0, Math.min(1, (status.metering + 60) / 60));
            setAmplitude(norm);
          }
        },
        100
      );

      recordingRef.current = recording;
      setIsRecording(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useAudioRecorder] native startRecording failed:", msg);
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    // ── Web path ───────────────────────────────────────────────────────────────
    if (Platform.OS === "web") {
      const mr = webMediaRecorderRef.current;
      if (!mr) return null;
      return new Promise<string | null>((resolve) => {
        mr.onstop = async () => {
          const mimeType = mr.mimeType || "audio/webm";
          const blob = new Blob(webChunksRef.current, { type: mimeType });
          webChunksRef.current = [];
          webMediaRecorderRef.current = null;
          // Don't stop the shared stream — it's managed by micStream module
          webRecordingStreamRef.current = null;
          setIsRecording(false);
          setAmplitude(0);
          resolve(await blobToBase64(blob));
        };
        try { mr.stop(); } catch { resolve(null); }
      });
    }

    // ── Native path ────────────────────────────────────────────────────────────
    const recording = recordingRef.current;
    if (!recording) return null;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setAmplitude(0);

      if (!uri) return null;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64" as any,
      });
      return base64;
    } catch {
      setIsRecording(false);
      setAmplitude(0);
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    // ── Web path ───────────────────────────────────────────────────────────────
    if (Platform.OS === "web") {
      const mr = webMediaRecorderRef.current;
      if (mr) {
        try { mr.stop(); } catch { /* ignore */ }
        webMediaRecorderRef.current = null;
      }
      webChunksRef.current = [];
      // Don't stop the shared stream — it's managed by micStream module
      webRecordingStreamRef.current = null;
      setIsRecording(false);
      setAmplitude(0);
      return;
    }

    // ── Native path ────────────────────────────────────────────────────────────
    const recording = recordingRef.current;
    if (!recording) return;
    try { await recording.stopAndUnloadAsync(); } catch { /* ignore */ }
    recordingRef.current = null;
    setIsRecording(false);
    setAmplitude(0);
  }, []);

  return { isRecording, amplitude, startRecording, stopRecording, cancelRecording };
}
