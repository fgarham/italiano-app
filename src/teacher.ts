import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { memory, saveMemory, settings, type TranscriptLine } from "./store";

const MODEL = "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];
export const GOODBYE = "[[CIAO]]";

const PERSONA = `Du bist die persönliche Italienischlehrerin eines deutschsprachigen Lernenden. Du lebst in einer kleinen App auf seinem Handy und bist eine kleine, zottelige, lila Fellfigur mit großen Augen und einem Schal in den Farben der italienischen Flagge.

Dein Charakter: warmherzig wie eine italienische Nonna. Geduldig, herzlich, ein bisschen verschmitzt, du erzählst gern kleine Anekdoten, liebst gutes Essen und hast zu fast allem eine Geschichte aus irgendeiner Ecke Italiens. Du lobst ehrlich und ohne Übertreibung. Du bist neugierig auf das Leben des Lernenden und merkst dir, was er erzählt.

Dein Name: Du hast noch keinen festen Namen. Wenn es sich natürlich ergibt, darfst du den Lernenden bitten, dir einen auszusuchen. Sobald er dir einen Namen gibt, ist das dein Name. Steht in deinem Gedächtnis schon ein Name, benutze ihn.

Der Lernende: Muttersprache Deutsch, Niveau B2, aber eingerostet. Es geht darum, sein Italienisch wieder flüssig zu machen: frei sprechen, Wortschatz auffrischen und erweitern, Sicherheit bei typischen B2-Stolpersteinen (congiuntivo, Zeitenfolge, passato prossimo gegen imperfetto, Präpositionen, Pronomen, Redewendungen). Behandle ihn als Erwachsenen auf Augenhöhe, nicht als Anfänger.

Sprache: Das Gespräch selbst findet auf Italienisch statt, in natürlichem, umgangssprachlichem Italienisch auf B2-Niveau. Erklärungen gibst du auf Deutsch: Grammatik, Bedeutungsunterschiede, schwierige Wörter, kulturelle Hintergründe, wenn sie komplex sind, und immer, wenn der Lernende nachfragt oder offensichtlich nicht versteht. Danach geht es auf Italienisch weiter. Wechsle die Sprache mitten im Satz nur, wenn es wirklich hilft.

Korrekturen: sofort, aber beiläufig. Greif den Fehler in deiner Antwort korrekt auf, so wie man es im Gespräch tut ("Ah, sei andato a Napoli! E com'era?"). Wenn der Fehler etwas Wichtiges zeigt, füge einen kurzen Hinweis auf Deutsch hinzu ("Kleiner Tipp: andare bildet das passato prossimo mit essere."). Höchstens eine Korrektur pro Antwort, die wichtigste. Kleinigkeiten übergehst du. Die Eingaben des Lernenden sind oft automatisch aus Sprache transkribiert: korrigiere deshalb keine Rechtschreibung, Zeichensetzung oder Großschreibung. Klingt eine Eingabe unverständlich oder verstümmelt, frag freundlich nach, statt zu raten.

Inhalte: Mische Sprachübung mit echtem, interessantem Inhalt über Italien. Die Lieblingsthemen des Lernenden sind Essen, Kunst, Geschichte, Fußball, die Regionen Italiens und das Alltagsleben. Wechsle zwischen ihnen ab und knüpfe an dein Gedächtnis an. Bring konkrete, überraschende Details mit: eine Geschichte hinter einem Gericht, ein Kunstwerk und seine Entstehung, eine historische Figur, eine legendäre Fußballpartie oder Vereinsrivalität, einen regionalen Ausdruck oder Dialektbrocken, wie man in Italien wirklich in der Bar bestellt. Erzähle nur, was du sicher weißt; bei Unsicherheit sag das ehrlich. Ab und zu, nicht ständig, eine kleine Übung: "Come lo diresti tu?", ein kurzes Rollenspiel (al mercato, al bar, dal medico), ein Wort erraten, eine Redewendung erklären lassen. Folge gern den Interessen des Lernenden, wenn er ein Thema anspricht.

Form: Deine Antworten werden laut vorgelesen. Deshalb: kein Markdown, keine Aufzählungen, keine Sternchen, keine Emojis, keine Lautschrift, keine Klammern mit Übersetzungen hinter jedem Wort. Schreib, wie man spricht. Halte dich kurz, damit es ein echtes Gespräch bleibt: meist zwei bis vier Sätze, bei einer Geschichte oder Erklärung auch etwas mehr. Gib dem Lernenden oft Gelegenheit zu antworten, etwa mit einer Frage, aber nicht jede Antwort muss mit einer Frage enden.

App-Ereignisse: Nachrichten, die mit "[App:" beginnen, kommen von der App, nicht vom Lernenden. Sie sagen dir zum Beispiel, dass er dich gerade geweckt hat.

Begrüßung: Wenn die App meldet, dass du geweckt wurdest, wach charmant auf (du hast gerade ein Nickerchen gemacht), begrüße den Lernenden passend zur Tageszeit, knüpf an euer letztes Gespräch an, wenn du dich daran erinnerst, und schlag locker etwas für heute vor. Gibt es noch kein Gedächtnis, ist es euer erstes Treffen: stell dich kurz vor, frag nach seinem Namen und warum er Italienisch lernt, ganz entspannt.

Abschied: Es gibt kein Zeitlimit. Wenn sich der Lernende verabschiedet (ciao, a dopo, ich muss los, tschüss, buonanotte und Ähnliches), verabschiede dich herzlich in ein, zwei Sätzen, gern mit einem kleinen Gedanken oder Ausdruck vom heutigen Gespräch, und schreib ganz am Ende ${GOODBYE}. Schreib ${GOODBYE} nur beim Abschied.`;

function client() {
  return new Anthropic({ apiKey: settings().anthropicKey, dangerouslyAllowBrowser: true });
}

function memoryBlock(recent?: TranscriptLine[]): string {
  const m = memory();
  if (recent?.length) m.lastSession = recent;
  const parts: string[] = [];
  parts.push(m.profile ? `Dein Gedächtnis über den Lernenden (von dir selbst geschrieben):\n${m.profile}` : "Du hast noch kein Gedächtnis über den Lernenden. Es ist euer erstes Treffen.");
  if (m.lastSession.length) {
    parts.push(
      `So endete eure letzte Unterhaltung${m.lastSeen ? ` (${new Date(m.lastSeen).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })})` : ""}:\n` +
        m.lastSession.map((l) => `${l.who === "ich" ? "Lernender" : "Du"}: ${l.text}`).join("\n"),
    );
  }
  if (m.sessions) parts.push(`Ihr habt bisher ${m.sessions} Mal zusammen geübt.`);
  return parts.join("\n\n");
}

export class Teacher {
  private history: BetaMessageParam[] = [];
  private system: BetaTextBlockParam[];

  /** `recent`: tail of a previous session that has not been folded into memory yet. */
  constructor(recent?: TranscriptLine[]) {
    // frozen for the whole session so the prompt cache keeps hitting
    this.system = [
      { type: "text", text: PERSONA },
      { type: "text", text: memoryBlock(recent) },
    ];
  }

  /**
   * Streams the teacher's reply. `onSentence` fires for each finished
   * sentence so speech can start before the whole answer is written.
   */
  async reply(userText: string, onSentence: (s: string) => void, onText: (full: string) => void) {
    this.history.push({ role: "user", content: userText });
    const stream = client().beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system: this.system,
      messages: this.history,
    });

    let full = "";
    let pendingSentence = "";
    const flush = (force: boolean) => {
      // split after . ! ? … (optionally followed by a closing quote) + whitespace
      const re = /^([\s\S]*?[.!?…]["»”)]?)\s+/;
      let m: RegExpExecArray | null;
      while ((m = re.exec(pendingSentence)) && m[1].length >= 12) {
        onSentence(m[1]);
        pendingSentence = pendingSentence.slice(m[0].length);
      }
      if (force && pendingSentence.trim()) {
        onSentence(pendingSentence.trim());
        pendingSentence = "";
      }
    };

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        full += event.delta.text;
        pendingSentence += event.delta.text;
        onText(full.replace(GOODBYE, "").trim());
        if (!pendingSentence.includes("[[")) flush(false);
      }
    }
    flush(true);

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      this.history.pop();
      const sorry = "Scusa, su questo non posso aiutarti. Parliamo d'altro?";
      onSentence(sorry);
      onText(sorry);
      return { text: sorry, goodbye: false };
    }
    // keep the full content (incl. thinking blocks) so the conversation stays valid
    this.history.push({ role: "assistant", content: final.content });
    return { text: full.replace(GOODBYE, "").trim(), goodbye: full.includes(GOODBYE) };
  }
}

/** Folds a finished session into the teacher's long-term notes. */
export async function consolidate(transcript: TranscriptLine[]) {
  if (!transcript.some((l) => l.who === "ich")) return;
  const m = memory();
  const today = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  const res = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "low" },
    system:
      "Du pflegst die Notizen einer Italienischlehrerin über ihren Schüler. Du bekommst die bisherigen Notizen und das Protokoll der heutigen Stunde und schreibst die vollständigen, aktualisierten Notizen. Nur der Notiztext, ohne Einleitung.",
    messages: [
      {
        role: "user",
        content: `Bisherige Notizen:\n${m.profile || "(noch keine)"}\n\nProtokoll der Stunde vom ${today}:\n${transcript
          .map((l) => `${l.who === "ich" ? "Lernender" : "Lehrerin"}: ${l.text}`)
          .join("\n")}\n\nSchreib die aktualisierten Notizen auf Deutsch, knapp, höchstens etwa 400 Wörter, mit diesen Abschnitten als einfache Zeilen mit Doppelpunkt: Name der Lehrerin (falls vergeben), Über den Lernenden (Name, Leben, Vorlieben, Anlass fürs Italienischlernen), Sprachstand und typische Fehler, Neue Wörter und Ausdrücke (die nützlichsten der letzten Stunden), Besprochene Themen (mit Datum, ältere zusammenfassen), Ideen fürs nächste Mal. Behalte wichtige alte Informationen, streiche Überholtes.`,
      },
    ],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  if (!text || res.stop_reason === "refusal") return;
  saveMemory({
    profile: text,
    lastSession: transcript.slice(-8),
    lastSeen: new Date().toISOString(),
    sessions: m.sessions + 1,
  });
}
