export interface PcmData {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
}

export interface PiperModelConfig {
  readonly audio?: { readonly sample_rate?: number };
  readonly espeak: { readonly voice: string };
  readonly inference?: {
    readonly noise_scale?: number;
    readonly length_scale?: number;
    readonly noise_w?: number;
  };
  readonly phoneme_type?: "text" | "espeak" | "pinyin";
  readonly phoneme_id_map?: Record<string, readonly number[]>;
}

export interface PiperVoice {
  readonly key: string;
  readonly name: string;
  readonly language: {
    readonly code: string;
    readonly family: string;
    readonly region: string;
    readonly name_native: string;
    readonly name_english: string;
    readonly country_english: string;
  };
  readonly quality: string;
  readonly num_speakers: number;
  readonly speaker_id_map: Record<string, number>;
  readonly files: Record<string, { readonly size_bytes: number }>;
}

export interface EdgeVoice {
  readonly ShortName: string;
  readonly FriendlyName: string;
  readonly Locale: string;
}

export type TtsProvider = "edge" | "piper";
