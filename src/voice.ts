import { settings } from "./store";

const EL = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_multilingual_v2";
const STT_MODEL = "scribe_v2";

/**
 * Speech output (ElevenLabs, with the browser voice as fallback) and
 * microphone recording + transcription.
 */
export class Voice {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private level = new Uint8Array(256);
  private queue: Promise<AudioBuffer | null>[] = [];
  private playing = false;
  private current?: AudioBufferSourceNode;
  private generation = 0;
  private fakeMouth = false;
  private idleResolvers: (() => void)[] = [];
  onLevel: (v: number) => void = () => {};

  /** Must be called from a user gesture (tap) so mobile browsers allow audio. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
      const loop = () => {
        this.onLevel(this.readLevel());
        requestAnimationFrame(loop);
      };
      loop();
    }
    void this.ctx.resume();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  private readLevel() {
    if (this.fakeMouth) return 0.35 + 0.35 * Math.sin(performance.now() / 70) * Math.sin(performance.now() / 190);
    if (!this.analyser || !this.playing) return 0;
    this.analyser.getByteTimeDomainData(this.level);
    let sum = 0;
    for (const v of this.level) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / this.level.length);
    return Math.min(1, rms * 5.5);
  }

  get speaking() {
    return this.playing;
  }

  /** Queue a sentence; synthesis starts right away, playback stays in order. */
  say(text: string) {
    const clean = text.replace(/\[\[[A-Z]+\]\]/g, "").trim();
    if (!clean) return;
    const gen = this.generation;
    if (!settings().elevenKey || !settings().voiceId) {
      this.queue.push(Promise.resolve(null).then(() => (gen === this.generation ? this.browserSpeak(clean) : null)));
    } else {
      this.queue.push(this.synthesize(clean).catch((e) => {
        console.error(e);
        return null;
      }));
    }
    if (!this.playing) void this.drain();
  }

  /** Resolves once everything queued has been spoken. */
  whenIdle() {
    if (!this.playing && !this.queue.length) return Promise.resolve();
    return new Promise<void>((r) => this.idleResolvers.push(r));
  }

  stop() {
    this.generation++;
    this.queue = [];
    try {
      this.current?.stop();
    } catch {
      /* already stopped */
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.fakeMouth = false;
  }

  private async drain() {
    this.playing = true;
    while (this.queue.length) {
      const gen = this.generation;
      const buf = await this.queue.shift()!;
      if (gen !== this.generation) continue;
      if (buf) await this.play(buf);
    }
    this.playing = false;
    this.idleResolvers.splice(0).forEach((r) => r());
  }

  private play(buf: AudioBuffer) {
    return new Promise<void>((resolve) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buf;
      src.connect(this.analyser!);
      src.onended = () => resolve();
      this.current = src;
      src.start();
    });
  }

  private async synthesize(text: string): Promise<AudioBuffer> {
    const { elevenKey, voiceId } = settings();
    const res = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs Stimme: ${res.status} ${await res.text()}`);
    return this.ctx!.decodeAudioData(await res.arrayBuffer());
  }

  /** Fallback without ElevenLabs: the phone's own Italian voice. */
  private browserSpeak(text: string): Promise<null> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve(null);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "it-IT";
      const it = speechSynthesis.getVoices().find((v) => v.lang.startsWith("it") && /female|alice|federica|elsa/i.test(v.name))
        ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith("it"));
      if (it) u.voice = it;
      u.rate = 1.02;
      u.pitch = 1.1;
      u.onstart = () => (this.fakeMouth = true);
      u.onend = u.onerror = () => {
        this.fakeMouth = false;
        resolve(null);
      };
      speechSynthesis.speak(u);
    });
  }
}

export class Recorder {
  private rec?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;

  get active() {
    return this.rec?.state === "recording";
  }

  async start() {
    this.stream ??= await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.rec!;
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
  }
}

export async function transcribe(audio: Blob): Promise<string> {
  const { elevenKey } = settings();
  if (!elevenKey) throw new Error("Für Sprachaufnahmen brauche ich den ElevenLabs-Schlüssel (Einstellungen).");
  const form = new FormData();
  form.append("model_id", STT_MODEL);
  form.append("tag_audio_events", "false");
  const ext = audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("file", audio, `aufnahme.${ext}`);
  const res = await fetch(`${EL}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": elevenKey },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs Spracherkennung: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
