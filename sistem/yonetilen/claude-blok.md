## Digital brain (managed by dijital-beyin)

This folder is the user's personal digital brain. Text between the
`dijital-beyin` markers is rewritten on every update; write your own notes
outside them. Always reply in the user's language.

### What lives where

- `beynim/` holds the core files: `ben-kimim.md` (who the user is, how they
  want to be addressed), `aktif-projem.md` (current project),
  `verdigim-kararlar.md` (dated decisions) and `guncel-durum.md` (the latest
  state of things).
- `notlar/` holds free-form notes.
- `gunluk/` holds automatic session summaries, one file per day. Do not edit
  existing entries.
- `gelen-kutusu/` holds proposals waiting for the user's approval. Never treat
  them as decided.
- `sistem/` and `beyin.mjs` are system files. Do not edit them.

### Reading rules

- At session start a context block from these files is added automatically.
  If you do not see it, run `node beyin.mjs baglam` and read the output.
- When two notes disagree, the one with the newer `date:` wins. A note whose
  `supersedes` field names another note overrides that note.
- Lines marked `GEÇERSİZ` are no longer valid; use them only as history.
- Never invent facts that are not in the files. If something contradicts
  itself or is missing, ask the user.

### Writing rules

- New decision: append one line to `beynim/verdigim-kararlar.md` in the form
  `- YYYY-MM-DD — decision — reason`. Never delete or rewrite old lines.
- Changed decision: add ` GEÇERSİZ (YYYY-MM-DD)` to the end of the old line,
  then append the new decision as a new line.
- Keep `beynim/guncel-durum.md` current: when the state changes, update it and
  set its `date:` to today.
- Never store passwords, API keys, card numbers, IBANs or other secrets.
- If the user's message contains `[kaydetme]`, do not save anything from that
  conversation.
- Before a large rewrite of a `beynim/` file, show the user the change.

### Tools

- `node beyin.mjs ara "<query>"` searches all notes (Turkish-aware).
- `node beyin.mjs baglam` prints the start-of-session context.
- `node beyin.mjs doktor` checks that everything works.
- `node beyin.mjs guncelle` installs the latest released version.
