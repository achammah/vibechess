// ── Voice coaching (Web Speech API) ───────────────────────────────────────────
// Reads the grounded coach's prose aloud. Free, no API key, browser-native.
// Opt-in via the "chess-voice-coach" localStorage flag (Settings toggle).

export const voiceSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

export const voiceEnabled = () =>
  voiceSupported() && localStorage.getItem("chess-voice-coach") === "on";

/** Strip markdown / code fences so the spoken text sounds natural. */
const plain = (text) =>
  (text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** Speak text, cancelling any in-progress utterance first. */
export const speak = (text) => {
  if (!voiceSupported()) return;
  const body = plain(text);
  if (!body) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(body);
  u.rate = 1.0;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
};

export const stopSpeaking = () => {
  if (voiceSupported()) window.speechSynthesis.cancel();
};
