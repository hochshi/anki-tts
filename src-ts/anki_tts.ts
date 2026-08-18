/**
 * Anki TTS
 * https://github.com/krmanki/anki-tts
 * krmanki
 * MIT
 *
 * Provides two selectable TTS engines to Anki card templates: Microsoft Edge
 * (online) and Piper (offline, on-device neural TTS, powered by ONNX Runtime
 * Web + rhasspy/piper-voices from Hugging Face). Click "⚙ Settings" during
 * review to pick an engine, locale and voice.
 */
import { edgeTtsPlay, initEdgeTts } from "./providers/edge.js";
import { piperTtsPlay } from "./providers/piper.js";
import { getEdgeLocal, getPiperLocal, setupTtsConfig, showConfig, ttsPlay } from "./ui.js";

setupTtsConfig();

document.addEventListener("DOMContentLoaded", () => {
  initEdgeTts().catch(error => console.error("Failed to initialize Edge TTS:", error));
});

// Exposed for Anki card templates. getLocal()/edgeTtsPlay() are kept for backwards
// compatibility with existing card templates that call them directly.
(window as any).showConfig = showConfig;
(window as any).ttsPlay = ttsPlay;
(window as any).getLocal = getEdgeLocal;
(window as any).getPiperLocal = getPiperLocal;
(window as any).edgeTtsPlay = edgeTtsPlay;
(window as any).piperTtsPlay = piperTtsPlay;
