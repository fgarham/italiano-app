/** Everything lives in this phone's local storage. */

export interface Settings {
  anthropicKey: string;
  elevenKey: string;
  voiceId: string;
}

export interface TranscriptLine {
  who: "lehrerin" | "ich";
  text: string;
}

export interface Memory {
  /** Free-text learner profile written by the teacher herself. */
  profile: string;
  /** Last lines of the previous session, for a natural "where were we". */
  lastSession: TranscriptLine[];
  lastSeen: string | null;
  sessions: number;
}

const K_SETTINGS = "italiano.settings";
const K_MEMORY = "italiano.memory";
const K_PENDING = "italiano.pending";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Speichern fehlgeschlagen", e);
  }
}

export const settings = () => read<Settings>(K_SETTINGS, { anthropicKey: "", elevenKey: "", voiceId: "" });
export const saveSettings = (s: Settings) => write(K_SETTINGS, s);

const emptyMemory: Memory = { profile: "", lastSession: [], lastSeen: null, sessions: 0 };
export const memory = () => read<Memory>(K_MEMORY, emptyMemory);
export const saveMemory = (m: Memory) => write(K_MEMORY, m);

/** Transcript of the running session, saved after every turn so nothing is lost if the app is swiped away. */
export const pending = (): TranscriptLine[] => {
  try {
    return JSON.parse(localStorage.getItem(K_PENDING) ?? "[]");
  } catch {
    return [];
  }
};
export const savePending = (t: TranscriptLine[]) => write(K_PENDING, t);
export const clearPending = () => localStorage.removeItem(K_PENDING);

export function exportMemory() {
  const blob = new Blob([JSON.stringify({ memory: memory(), pending: pending() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `italiano-gedaechtnis-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importMemory(file: File) {
  const data = JSON.parse(await file.text());
  if (data.memory) saveMemory({ ...emptyMemory, ...data.memory });
  if (Array.isArray(data.pending)) savePending(data.pending);
}

export function resetMemory() {
  localStorage.removeItem(K_MEMORY);
  clearPending();
}
