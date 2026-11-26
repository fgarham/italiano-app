import "./style.css";
import Anthropic from "@anthropic-ai/sdk";
import { Avatar } from "./avatar";
import { Recorder, transcribe, Voice } from "./voice";
import { consolidate, Teacher } from "./teacher";
import {
  clearPending,
  exportMemory,
  importMemory,
  pending,
  resetMemory,
  saveSettings,
  savePending,
  settings,
  type TranscriptLine,
} from "./store";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $<HTMLCanvasElement>("stage");
const bubble = $("bubble");
const bubbleText = $("bubble-text");
const you = $("you");
const hint = $("hint");
const zzz = $("zzz");
const mic = $<HTMLButtonElement>("mic");
const kbd = $<HTMLButtonElement>("kbd");
const textForm = $<HTMLFormElement>("textform");
const textInput = $<HTMLInputElement>("textinput");
const dialog = $<HTMLDialogElement>("settings");
const settingsForm = $<HTMLFormElement>("settings-form");

const avatar = new Avatar(stage);
const voice = new Voice();
const recorder = new Recorder();
voice.onLevel = (v) => avatar.setMouth(v);

let teacher: Teacher | null = null;
let transcript: TranscriptLine[] = [];
let busy = false;

/* ---------------- session ---------------- */

function setAwake(awake: boolean) {
  document.body.classList.toggle("awake", awake);
  zzz.hidden = awake;
  hint.hidden = awake;
}

async function wake() {
  if (teacher || busy) return;
  if (!settings().anthropicKey) return openSettings();
  voice.unlock();
  setAwake(true);
  avatar.setMood("waking");

  // a session that was swiped away without "ciao" gets folded into memory now
  const leftover = pending();
  clearPending();
  transcript = [];
  teacher = new Teacher(leftover.slice(-8));
  if (leftover.length) {
    consolidate(leftover).catch((e) => {
      console.error(e);
      savePending([...leftover, ...pending()]);
    });
  }

  await sleep(1900);
  const now = new Date();
  const when = now.toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  await turn(`[App: Der Lernende hat die App geöffnet und dich gerade geweckt. Es ist ${when} Uhr.]`, false);
}

async function turn(text: string, fromUser: boolean) {
  if (!teacher) return;
  busy = true;
  if (fromUser) {
    you.textContent = text;
    you.hidden = false;
    transcript.push({ who: "ich", text });
    savePending(transcript);
  }
  avatar.setMood("thinking");
  bubble.classList.remove("error");
  bubbleText.textContent = "…";
  try {
    let started = false;
    const result = await teacher.reply(
      text,
      (sentence) => {
        if (!started) {
          started = true;
          avatar.setMood("talking");
        }
        voice.say(sentence);
      },
      (full) => {
        bubbleText.textContent = full;
        bubble.scrollTop = bubble.scrollHeight;
      },
    );
    transcript.push({ who: "lehrerin", text: result.text });
    savePending(transcript);
    busy = false;
    await voice.whenIdle();
    if (result.goodbye) return goodbye();
    if (avatar.getMood() === "talking") avatar.setMood("idle");
  } catch (e) {
    busy = false;
    avatar.setMood("idle");
    showError(e);
  }
}

async function goodbye() {
  const t = transcript;
  teacher = null;
  transcript = [];
  avatar.setMood("dozing");
  await sleep(1500);
  avatar.setMood("sleeping");
  setAwake(false);
  hint.textContent = "Tippe, um sie wieder zu wecken";
  you.hidden = true;
  try {
    await consolidate(t);
    clearPending();
  } catch (e) {
    console.error("Gedächtnis konnte nicht gespeichert werden, versuche es beim nächsten Start erneut.", e);
  }
}

function showError(e: unknown) {
  console.error(e);
  let msg = "Da ist etwas schiefgegangen. Versuch es gleich noch einmal.";
  if (e instanceof Anthropic.AuthenticationError) msg = "Der Anthropic-Schlüssel stimmt nicht. Bitte in den Einstellungen prüfen.";
  else if (e instanceof Anthropic.RateLimitError) msg = "Zu viele Anfragen auf einmal. Einen Moment, dann nochmal.";
  else if (e instanceof Anthropic.APIConnectionError) msg = "Keine Verbindung. Bist du online?";
  else if (e instanceof Anthropic.APIError) msg = `Fehler von Claude (${e.status}). ${e.message}`;
  else if (e instanceof Error && e.message) msg = e.message;
  bubble.classList.add("error");
  bubbleText.textContent = msg;
}

/* ---------------- input ---------------- */

stage.addEventListener("click", () => void wake());
hint.addEventListener("click", () => void wake());
zzz.addEventListener("click", () => void wake());

mic.addEventListener("click", async () => {
  if (!teacher) return void wake();
  if (voice.speaking) voice.stop(); // tap to interrupt her
  if (recorder.active) {
    mic.classList.remove("recording");
    avatar.setMood("thinking");
    try {
      const blob = await recorder.stop();
      const text = await transcribe(blob);
      if (!text) {
        avatar.setMood("idle");
        bubbleText.textContent = "Non ho sentito niente… prova ancora?";
        return;
      }
      await turn(text, true);
    } catch (e) {
      avatar.setMood("idle");
      showError(e);
    }
    return;
  }
  if (busy) return;
  try {
    if (!settings().elevenKey) throw new Error("Für Sprachaufnahmen brauche ich den ElevenLabs-Schlüssel. Bis dahin kannst du unten links tippen.");
    await recorder.start();
    mic.classList.add("recording");
    avatar.setMood("listening");
  } catch (e) {
    showError(e instanceof DOMException ? new Error("Ich darf das Mikrofon nicht benutzen. Bitte erlaube den Zugriff in den Browser-Einstellungen.") : e);
  }
});

kbd.addEventListener("click", () => {
  textForm.hidden = !textForm.hidden;
  if (!textForm.hidden) textInput.focus();
});

textForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;
  if (!teacher) return void wake();
  if (busy) return;
  voice.unlock();
  voice.stop();
  textInput.value = "";
  void turn(text, true);
});

/* ---------------- settings ---------------- */

function openSettings() {
  const s = settings();
  for (const [k, v] of Object.entries(s)) {
    const input = settingsForm.elements.namedItem(k) as HTMLInputElement | null;
    if (input) input.value = v;
  }
  dialog.showModal();
}

$("gear").addEventListener("click", openSettings);
dialog.addEventListener("close", () => {
  if (dialog.returnValue !== "save") return;
  const f = new FormData(settingsForm);
  saveSettings({
    anthropicKey: String(f.get("anthropicKey") ?? "").trim(),
    elevenKey: String(f.get("elevenKey") ?? "").trim(),
    voiceId: String(f.get("voiceId") ?? "").trim(),
  });
});
$("mem-export").addEventListener("click", exportMemory);
$("mem-import").addEventListener("click", () => $("mem-file").click());
$<HTMLInputElement>("mem-file").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    await importMemory(file);
    alert("Gedächtnis importiert.");
  } catch {
    alert("Diese Datei konnte ich nicht lesen.");
  }
});
$("mem-reset").addEventListener("click", () => {
  if (confirm("Soll sie wirklich alles vergessen, was sie über dich weiß?")) resetMemory();
});
$("credits").textContent = __CREDITS__;

/* ---------------- boot ---------------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
setAwake(false);
avatar.setMood("sleeping");
if (!settings().anthropicKey) setTimeout(openSettings, 600);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.error);
}

declare const __CREDITS__: string;
