# Dijital Beyin kurulumu

> **Türkçe not:** Bu dosya yapay zekâ ajanının (Claude Code, Codex) okuması
> için yazıldı. Kendin kuracaksan README.md'deki "Elle kurulum" bölümüne bak.
> Ajana şunu söylemen yeterli: "KURULUM.md dosyasını oku ve Dijital Beyin'i bu
> klasöre kur, var olan dosyalarıma dokunma."

## Instructions for the AI agent

You are installing Dijital Beyin, a local, model-independent digital brain,
into the user's current folder. Talk to the user in their language (usually
Turkish). Never ask for API keys, tokens or passwords; the kit needs none.

1. **Check Node.js.** Run `node --version`. It must be 20 or newer. If Node is
   missing or older, stop and tell the user to install the current LTS from
   https://nodejs.org, then start again.

2. **Pick the target.** The target (`HEDEF`) is the folder this session was
   opened in. Look at it:
   - If it contains `.beyin/kurulum.json`, it is already a vault; reinstalling
     is safe and only refreshes system files.
   - If it is empty, continue.
   - If it is not empty and not a vault, tell the user what is in it and ask
     before continuing. Existing files are never overwritten, but the user
     should decide whether this folder is the right home for their notes.
   - If it is not a vault but already has a `sistem/` folder or a `beyin.mjs`
     file, the installer stops (`hedef_cakisma`), because those names are
     replaced on every update. Suggest an empty folder instead. Use
     `--uzerine-yaz` only if the user explicitly agrees; it backs the old ones
     up to `.beyin/yedek/` first.

3. **Download the latest release into a temporary folder outside the target.**
   The installer refuses to run from inside the target. Either:
   - `git clone --depth 1 https://github.com/grafikcemm/dijital-beyin.git "<TEMP>/dijital-beyin"`, or
   - download "Source code (zip)" from
     https://github.com/grafikcemm/dijital-beyin/releases/latest and extract it
     to `<TEMP>`.
   Use the OS temp directory (`$env:TEMP` on Windows, `/tmp` or `$TMPDIR` on
   macOS/Linux).

4. **Run the installer.** Quote paths; they may contain spaces and Turkish
   characters.
   ```
   node "<TEMP>/dijital-beyin/kur.mjs" --hedef "<HEDEF>"
   ```
   If the user also uses Codex, add `--istemci claude,codex`. To preview
   without writing, add `--plan`. If it exits with an error, show the message
   to the user and stop; do not edit the installer.

5. **Check health.** In the target folder run `node beyin.mjs doktor` and
   report the result in plain words. Warnings about empty or stale notes are
   expected on a fresh install.

6. **Clean up.** Delete only the temporary download folder you created in
   step 3.

7. **Hand over.** Tell the user:
   - Open the vault folder itself in Claude Code (the project root must be
     exactly this folder) and start a **new session**; the start hook only
     runs in new sessions.
   - For Codex: open the folder, type `/hooks` and trust the three Dijital
     Beyin hooks. This cannot be skipped by the installer.
   - The four files in `beynim/` are theirs to fill; offer to fill them
     together.

8. **Verify in the new session.** Ask the user to say something like
   "Bir karar kaydet: ana rengim koyu yeşil." The agent should append a dated
   line to `beynim/verdigim-kararlar.md`. Then, in another new session, ask
   "Ana rengim neydi?" and confirm the answer comes from the file.

Do not modify `sistem/`, `beyin.mjs` or the text between the
`dijital-beyin` markers in `CLAUDE.md`, `AGENTS.md` and `.gitignore`; they are
managed by the kit and rewritten on update.
