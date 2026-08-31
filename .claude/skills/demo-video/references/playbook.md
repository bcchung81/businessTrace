# Demo-Video Playbook — full detail (pitfalls · script template · QA conventions)

Follow this when executing the workflow in the agent instruction file (`SKILL.md` / `AGENTS.md` / etc.).
Everything here was fixed in a real production run (a 10-scene product feature demo, scenes 0–9, ~6.5 min montage, user-approved).

> All specific numbers below (sleep durations, zoom ratios, speed-up factors, colors) are **measured values that worked** — change them only with a reason.

## 1. Storyboard template (scene table — approve BEFORE shooting)

| # | Enter | Action (what the camera captures) | Input (exact) | Zoom | Speed-up window | Subtitle (value prop) | Label |
|---|-------|-----------------------------------|---------------|------|-----------------|------------------------|-------|
| 3 | /panel/knowledge | pick deep-search → type question → scroll answer → toggle graph | `What are the types of disciplinary action and the appeal process?` | evidence bullets · graph | LLM wait | "Graph RAG makes company knowledge easy to find" | `3. AI knowledge search` |

- The subtitle is not a feature description — it is **one sentence of value** (what gets better for the user).
- Scene order: [intro (6s whole-app sweep) → features → flagship output → outro].
- File-upload scenes: secure the local file path in this step (ask the user to save it). Use `page.setInputFiles('input[type=file]', path)`.

## 2. Pitfall catalog (in the order we hit them)

1. **Lost webm**: `ctx.close()` is what flushes the recording — calling only `browser.close()` produces no video. Order is fixed.
2. **Initial render exposed**: without `waitUntil:'networkidle'` on `goto`, you film the loading state.
3. **File upload**: an image pasted into chat cannot be used by automation — you need a real file path on disk.
4. **No fixed sleep for LLM waits**: response time varies every run, so the video drags or gets cut. Detect with `waitForFunction` (a text pattern that appears only in the result + `document.body.innerText.length > N`), and record `waitMs` to size the post-process speed-up window.
5. **Overlay dragged by zoom**: subtitle/cursor placed under `body` get scaled during `__zoom` — they MUST be direct children of `documentElement`.
6. **Dead-air**: leave a wait window at real speed and you keep 28s of nothing (measured) — 6–9x compression is mandatory.
7. **Cursor teleports**: clicking immediately after moving, without `sleep(800)` (time for the viewer to follow the cursor), looks unnatural.
8. **Killing the wrong server**: the target app is often the user's own dev server — never touch it (no `pkill` etc.). Check previews via curl / headless only.
9. **Element not found**: if `box('button','text')` returns null, the sequence silently skips — this surfaces in the PoC montage as a "scene where the click never happened." Verify each action left a trace (screen transition) in the montage.

## 3. Overlay parameters (this IS the tone — get user approval to change)

- Subtitle bar: `bottom:54px`, `rgba(15,18,28,.85)`, 30px/600, radius 12px, max-width 80%, transition .35s
- Label: bottom-left `36px`, blue `rgba(37,99,235,.95)`, 24px/700
- Cursor: 28px SVG arrow, `transition .7s cubic-bezier(.4,0,.2,1)`, drop-shadow
- Zoom: `body{transition:transform .8s}` + `transformOrigin` at the point of interest, ratio 1.35 is the standard

## 4. Standard scene sequence

```
subtitle on (2.6s)
→ [action 1] cursor move (0.8s) → click → confirm reaction (0.35s+)
→ [input] click → page.type(delay:55) → 0.8s
→ [submit] click → swap subtitle to "Analyzing…" → waitForFunction → record waitMs
→ swap result subtitle (1.8s) → scroll (wheel 350) → zoom 1.35 (2.2s) → unzoom (0.9s)
→ [extra feature toggle] → subtitle (2.8s)
→ subtitle off → 0.7s → ctx.close()
```

## 5. Post-process + QA procedure (every scene)

1. `speedup in.webm out.mp4 <waitStartSec> <endSec> 9` (no wait → `tomp4`)
2. `montage out.mp4 check.png` → **always open it**: subtitle overlap? zoom on the wrong spot? action traces (screen transitions)? label showing?
3. `duration` to confirm target length (25–45s) — too long → widen speed-up window, too short → add result-emphasis sleep
4. Problem found → fix the sequence → re-capture (re-rendering is cheap — favor polish)

## 6. Montage + final QA

1. Name scene clips `clips/N_feature.mp4` → `concat_all` → `final/name_montage.mp4`
2. `spotcheck montage.mp4 "5 60 130 190"` — check scene cuts / subtitle consistency at frames
3. **Declare done only after the user plays the real file.** Automated metrics (length, frame count) are secondary — completion here is a triple check (montage + spot frames + user playback).
4. User feedback arrives in seconds ("no screenshot around 0:10") — precisely fix that timestamp's sequence line (zoom coords / sleep) and re-render that scene only.

## 7. Multi-scene generator (gen.js) structure

Three or more scenes → one file instead of copying the template:
```js
const SCENES = {
  0: { path: '/',     label: 'My App',           run: async (p, h) => { /* sequence */ } },
  1: { path: '/quiz', label: '1. AI literacy',   run: async (p, h) => { /* sequence */ } },
};
const scene = SCENES[process.argv[2]];
// Browser boot · overlay injection · helpers (h = {box, moveClick, sleep}) defined once in the shared part
```
Run: `node gen.js 3` → save with the scene number in the clip name. Being able to re-run only the failed scene helps iterative fixes.

## 8. Cross-platform notes

- **Chrome path**: `cap_scene.template.js` auto-detects Chrome/Chromium/Edge on macOS/Linux/Windows. Override with `CHROME_PATH=/path/to/chrome`. If none is found it falls back to Playwright's bundled Chromium — run `npx playwright install chromium` first in that case.
- **Fonts**: the overlay font stack covers Apple SD Gothic Neo (macOS), Segoe UI (Windows), Roboto (Linux). On minimal Linux containers, install a CJK font (`fonts-noto-cjk`) if your subtitles use CJK text, or the bar renders tofu boxes.
- **ffmpeg on Windows**: run `postprocess.sh` under WSL or Git Bash, or translate the functions to PowerShell — the ffmpeg filter strings are identical.
- **Headless Linux/CI**: keep `--no-sandbox`; add `--disable-gpu` if the container has no GPU. `xvfb` is NOT required for headless recording.
