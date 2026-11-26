# Italiano 🇮🇹

Eine kleine, zottelige Italienischlehrerin fürs Handy. App öffnen, sie antippen, sie wacht auf und plaudert los: auf Italienisch, mit Erklärungen auf Deutsch, mit Geschichten über Essen, Kunst, Geschichte, Fußball, Regionen und Alltag. Sprechen per Mikrofon oder tippen. Zum Abschied einfach „Ciao“ sagen, dann schläft sie wieder ein und merkt sich, was ihr gemacht habt.

## Einrichtung (einmalig)

1. **GitHub Pages einschalten:** Im Repository unter *Settings → Pages → Build and deployment → Source* „GitHub Actions“ wählen.
   Hinweis: Bei kostenlosen GitHub-Konten funktioniert Pages nur mit **öffentlichen** Repositories. Das ist hier unbedenklich, weil keine Schlüssel im Code stehen.
2. Danach baut GitHub die App bei jedem Push automatisch. Sie läuft dann unter `https://fgarham.github.io/italiano-app/`.
3. **Aufs Handy holen:** die Adresse im Handy-Browser öffnen
   - iPhone (Safari): Teilen → „Zum Home-Bildschirm“
   - Android (Chrome): Menü → „App installieren“
4. **Schlüssel eintragen:** Beim ersten Start öffnen sich die Einstellungen.
   - Anthropic-API-Schlüssel: console.anthropic.com → API Keys (Guthaben aufladen)
   - ElevenLabs-API-Schlüssel: elevenlabs.io → Profil → API Keys
   - Stimmen-ID: In der Voice Library eine weibliche Stimme wählen, die Italienisch und Deutsch gut kann, zu „My Voices“ hinzufügen und die ID kopieren.

Die Schlüssel und das Gedächtnis bleiben nur auf deinem Handy. In den Einstellungen kannst du das Gedächtnis exportieren und importieren, zum Beispiel für ein neues Handy.

## Eigene 3D-Figur

Ohne Modell zeigt die App ein lila Fellknäuel. Für eine andere Figur:

1. Bei Sketchfab das Modell als **GLB** herunterladen.
2. Als `public/model/teacher.glb` ins Repository legen.
3. Bei CC-BY-Lizenz eine Datei `public/model/CREDITS.txt` mit der Namensnennung anlegen, zum Beispiel
   `Figur: „Cute Little Monster“ von 1neEye (Sketchfab), CC BY 4.0`.
   Sie erscheint dann in den Einstellungen.

Wenn das Modell Mund- oder Blinzel-Blendshapes oder einen Kieferknochen hat, werden sie automatisch benutzt.

## Entwicklung

```bash
npm install
npm run dev
```

Technik: Vite + TypeScript, three.js für die Figur (Shell-Fur-Shader), Claude (`claude-opus-5-5`) für das Gespräch und das Gedächtnis, ElevenLabs für Stimme (`eleven_multilingual_v2`) und Spracherkennung (`scribe_v2`).
