/**
 * Shared microphone stream manager.
 * Call acquireMicStream() inside a user-gesture handler (e.g. onPress) so the
 * browser grants permission within the activation context.  Voice screen and
 * recorder then reuse the same live stream — no second getUserMedia call.
 */

let _stream: MediaStream | null = null;
let _acquiring: Promise<MediaStream | null> | null = null;

export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

export async function checkMicPermission(): Promise<MicPermission> {
  if (typeof navigator === "undefined") return "unknown";
  try {
    const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return result.state as MicPermission;
  } catch {
    return "unknown";
  }
}

export async function acquireMicStream(): Promise<MediaStream | null> {
  // Return existing live stream
  if (_stream && _stream.getAudioTracks().some(t => t.readyState === "live")) {
    return _stream;
  }
  // Deduplicate concurrent calls
  if (_acquiring) return _acquiring;

  _acquiring = (async () => {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return _stream;
    } catch {
      return null;
    } finally {
      _acquiring = null;
    }
  })();

  return _acquiring;
}

export function getSharedMicStream(): MediaStream | null {
  if (_stream && _stream.getAudioTracks().some(t => t.readyState === "live")) {
    return _stream;
  }
  return null;
}

/** Call when leaving voice mode to release mic tracks. */
export function releaseMicStream(): void {
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
}
