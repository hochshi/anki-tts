import { createStyle, el, icon } from "./dom.js";
import { installGlobalLogging, logLine } from "./log.js";
import { stopPlayback, togglePlayPause } from "./player.js";
import { edgeTtsPlay, getEdgeVoices, initEdgeTts } from "./providers/edge.js";
import { getPiperVoices, piperTtsPlay } from "./providers/piper.js";
import { EdgeVoice, PiperVoice, TtsProvider } from "./types.js";

interface VoiceOption { readonly value: string; readonly label: string; }
type VoiceDict = Record<string, VoiceOption[]>;

let dict: VoiceDict = {};
let localeNames: Record<string, string> = {};
let piperVoicesByKey: Record<string, PiperVoice> = {};

export function getProvider(): TtsProvider {
  return (localStorage.getItem("ttsProvider") as TtsProvider) || "edge";
}

export function getEdgeLocal(): [string, string] {
  return [localStorage.getItem("ttsLocale") || "zh", localStorage.getItem("ttsVoice") || "zh-CN-XiaoxiaoNeural"];
}

export function getPiperLocal(): [string, string] {
  return [localStorage.getItem("ttsPiperLocale") || "zh", localStorage.getItem("ttsPiperVoice") || "zh_CN-huayan-medium"];
}

function groupEdgeVoices(voices: EdgeVoice[]): VoiceDict {
  const dict: VoiceDict = {};
  localeNames = {};
  for (const voice of voices) {
    const locale = voice.Locale.split("-")[0] || "default";
    if (!(locale in localeNames)) localeNames[locale] = voice.LocaleName.split("(")[0].trim();
    (dict[locale] ??= []).push({ value: voice.ShortName, label: voice.FriendlyName });
  }
  return dict;
}

function groupPiperVoices(voices: Record<string, PiperVoice>): VoiceDict {
  const dict: VoiceDict = {};
  localeNames = {};
  piperVoicesByKey = voices;
  for (const voice of Object.values(voices)) {
    const locale = voice.language.family || "default";
    if (!(locale in localeNames)) localeNames[locale] = voice.language.name_english;
    (dict[locale] ??= []).push({ value: voice.key, label: `${voice.name} (${voice.quality})` });
  }
  return dict;
}

function sortedDict(dict: VoiceDict): VoiceDict {
  return Object.keys(dict).sort().reduce((acc, key) => { acc[key] = dict[key]; return acc; }, {} as VoiceDict);
}

function setStatus(msg: string, percent?: number): void {
  const status = document.getElementById("ttsStatus");
  if (status) status.textContent = msg;

  const progress = document.getElementById("ttsProgress") as HTMLProgressElement | null;
  if (progress) {
    if (percent != null) { progress.style.display = "block"; progress.value = percent; }
    else progress.style.display = "none";
  }
}

async function setConfig(): Promise<void> {
  const provider = getProvider();
  setStatus("Loading voices…");
  try {
    if (provider === "piper") {
      dict = sortedDict(groupPiperVoices(await getPiperVoices()));
    } else {
      if (!getEdgeVoices()) await initEdgeTts();
      dict = sortedDict(groupEdgeVoices(getEdgeVoices() || []));
    }
    setLocale();
    setStatus("");
  } catch (error) {
    console.error("Error loading voices:", error);
    setStatus("Failed to load voices, see console.");
  }
}

function setVoice(): void {
  const localeSelect = document.getElementById("localeSelect") as HTMLSelectElement;
  const voiceSelect = document.getElementById("voiceSelect") as HTMLSelectElement;
  const speakerRow = document.getElementById("speakerRow") as HTMLDivElement;
  voiceSelect.innerHTML = "";

  for (const { value, label } of dict[localeSelect.value] || []) {
    const option = document.createElement("option");
    option.value = value;
    option.text = label;
    voiceSelect.add(option);
  }

  updateSpeakerOptions();
  speakerRow.style.display = getProvider() === "piper" && (piperVoicesByKey[voiceSelect.value]?.num_speakers || 0) > 1 ? "block" : "none";
}

function updateSpeakerOptions(): void {
  if (getProvider() !== "piper") return;
  const voiceSelect = document.getElementById("voiceSelect") as HTMLSelectElement;
  const speakerSelect = document.getElementById("speakerSelect") as HTMLSelectElement;
  const voice = piperVoicesByKey[voiceSelect.value];
  speakerSelect.innerHTML = "";
  if (!voice) return;
  for (const [name, id] of Object.entries(voice.speaker_id_map)) {
    const option = document.createElement("option");
    option.value = String(id);
    option.text = name;
    speakerSelect.add(option);
  }
}

function setLocale(): void {
  const provider = getProvider();
  const localeSelect = document.getElementById("localeSelect") as HTMLSelectElement;
  localeSelect.innerHTML = "";

  const keys = Object.keys(dict).sort((a, b) => (localeNames[a] || a).localeCompare(localeNames[b] || b));
  for (const key of keys) {
    const option = document.createElement("option");
    option.value = key;
    option.text = localeNames[key] ? `${localeNames[key]} (${key})` : key;
    localeSelect.add(option);
  }

  setVoice();

  const [locale, voice] = provider === "piper" ? getPiperLocal() : getEdgeLocal();
  if (dict[locale]) { localeSelect.value = locale; setVoice(); }

  const voiceSelect = document.getElementById("voiceSelect") as HTMLSelectElement;
  if (voice) voiceSelect.value = voice;
  const speakerId = localStorage.getItem("ttsPiperSpeaker");
  if (provider === "piper" && speakerId) {
    const speakerSelect = document.getElementById("speakerSelect") as HTMLSelectElement;
    speakerSelect.value = speakerId;
  }

  localeSelect.onchange = e => {
    const value = (e.target as HTMLSelectElement).value;
    localStorage.setItem(provider === "piper" ? "ttsPiperLocale" : "ttsLocale", value);
    setVoice();
  };
  voiceSelect.onchange = e => {
    const value = (e.target as HTMLSelectElement).value;
    localStorage.setItem(provider === "piper" ? "ttsPiperVoice" : "ttsVoice", value);
    updateSpeakerOptions();
    const speakerRow = document.getElementById("speakerRow") as HTMLDivElement;
    speakerRow.style.display = provider === "piper" && (piperVoicesByKey[value]?.num_speakers || 0) > 1 ? "block" : "none";
  };
  const speakerSelect = document.getElementById("speakerSelect") as HTMLSelectElement;
  speakerSelect.onchange = e => localStorage.setItem("ttsPiperSpeaker", (e.target as HTMLSelectElement).value);
}

export function showConfig(): void {
  const configDiv = document.getElementById("ttsConfigContainer") as HTMLDivElement;
  configDiv.style.display = configDiv.style.display === "none" ? "block" : "none";
  if (configDiv.style.display === "block") setConfig();
}

function toggleLog(): void {
  const section = document.getElementById("ttsLogSection") as HTMLDivElement;
  const body = document.getElementById("ttsLogBody") as HTMLDivElement;
  const open = section.classList.toggle("open");
  body.style.display = open ? "block" : "none";
}

export async function ttsPlay(text: string, voice?: string): Promise<void> {
  stopPlayback();
  const provider = getProvider();
  try {
    if (provider === "piper") {
      const [, defaultVoice] = getPiperLocal();
      const speakerId = localStorage.getItem("ttsPiperSpeaker");
      await piperTtsPlay(text, voice || defaultVoice, speakerId ? Number(speakerId) : undefined, setStatus);
    } else {
      const [, defaultVoice] = getEdgeLocal();
      await edgeTtsPlay(text, voice || defaultVoice);
    }
  } catch (error) {
    logLine("error", "TTS playback failed:", error);
    setStatus("Playback failed — see Log below.");
  }
}

export function setupTtsConfig(): void {
  createStyle();
  installGlobalLogging();

  const buttonContainer = el("div", { id: "ttsButtonContainer" }, null, document.body);
  const playBtn = el("button", { id: "ttsPlayButton" }, null, buttonContainer);
  playBtn.innerHTML = `${icon("play")}<span>Play</span>`;
  playBtn.onclick = () => { if (!togglePlayPause()) (window as any).playTts?.(); };
  const stopBtn = el("button", { id: "ttsStopButton", title: "Stop" }, null, buttonContainer);
  stopBtn.innerHTML = icon("stop");
  stopBtn.onclick = () => stopPlayback();
  const configBtn = el("button", { id: "ttsShowConfig" }, null, buttonContainer);
  configBtn.innerHTML = `${icon("settings")}<span>Settings</span>`;
  configBtn.onclick = () => showConfig();

  el("progress", { id: "ttsPlaybackProgress", max: "0", value: "0" }, null, document.body);

  const container = el("div", { id: "ttsConfigContainer", style: "display: none" }, null, document.body);
  const configDiv = el("div", { id: "msttsConfig" }, null, container);
  const closeBtn = el("div", { id: "closeBtn" }, null, configDiv);
  closeBtn.innerHTML = icon("x");
  closeBtn.onclick = () => { container.style.display = "none"; };

  el("label", { id: "providerSelectLabel", for: "providerSelect" }, "TTS Engine", configDiv);
  const providerSelect = el("select", { id: "providerSelect" }, null, configDiv);
  const providers: Array<[TtsProvider, string]> = [
    ["edge", "Microsoft Edge (online)"],
    ["piper", "Piper (offline, on-device)"]
  ];
  for (const [value, label] of providers) {
    const option = document.createElement("option");
    option.value = value; option.text = label;
    providerSelect.add(option);
  }
  providerSelect.value = getProvider();
  providerSelect.onchange = e => {
    localStorage.setItem("ttsProvider", (e.target as HTMLSelectElement).value);
    setConfig();
  };

  el("label", { id: "localeSelectLabel", for: "localeSelect" }, "Locale", configDiv);
  el("select", { id: "localeSelect" }, null, configDiv);

  el("label", { id: "voiceSelectLabel", for: "voiceSelect" }, "Voice", configDiv);
  el("select", { id: "voiceSelect" }, null, configDiv);

  const speakerRow = el("div", { id: "speakerRow", style: "display: none" }, null, configDiv);
  el("label", { id: "speakerSelectLabel", for: "speakerSelect" }, "Speaker", speakerRow);
  el("select", { id: "speakerSelect" }, null, speakerRow);

  el("div", { id: "ttsStatus" }, null, configDiv);
  el("progress", { id: "ttsProgress", max: "100", value: "0" }, null, configDiv);

  const EMPTY_LOG = '<div class="ttsLogEmpty">No log entries yet.</div>';

  const logSection = el("div", { id: "ttsLogSection" }, null, configDiv);
  const logToggleRow = el("div", { id: "ttsLogToggleRow" }, null, logSection);
  const logTitle = el("div", { id: "ttsLogTitle" }, null, logToggleRow);
  logTitle.innerHTML = `${icon("terminal")}<span>Log</span>`;
  const logControls = el("div", { id: "ttsLogControls" }, null, logToggleRow);
  const clearLogBtn = el("button", { id: "clearLogBtn", title: "Clear log" }, null, logControls);
  clearLogBtn.innerHTML = icon("trash");
  clearLogBtn.onclick = e => {
    e.stopPropagation();
    const panel = document.getElementById("ttsLogPanel");
    if (panel) panel.innerHTML = EMPTY_LOG;
  };
  const chevron = el("span", { id: "ttsLogChevron" }, null, logControls);
  chevron.innerHTML = icon("chevronDown");
  logToggleRow.onclick = () => toggleLog();

  const logBody = el("div", { id: "ttsLogBody" }, null, logSection);
  const logPanel = el("div", { id: "ttsLogPanel" }, null, logBody);
  if (!logPanel.hasChildNodes()) logPanel.innerHTML = EMPTY_LOG;
}
