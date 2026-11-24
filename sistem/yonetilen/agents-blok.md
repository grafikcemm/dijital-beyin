## Digital brain (managed by dijital-beyin)

This folder is the user's personal digital brain. Text between the
`dijital-beyin` markers is rewritten on every update; write your own notes
outside them. Always reply in the user's language.

### First step in every session

Run `node beyin.mjs baglam` and read its output before answering, unless a
dijital-beyin context block was already added to this session by a start
hook. Clients without hooks must always run it.

### Session bridge

At the start of every session, read these three files first:

- `beynim/01-Kimlik.md`: who the user is.
- `beynim/02-Guncel-Durum.md`: this week's state, current numbers and active
  projects.
- `beynim/04-Tuzaklar.md`: mistakes not to repeat, one per line.

Follow `beynim/05-Calisma-Tarzim.md` whenever you write for the user. Before
you suggest an idea, check `beynim/03-Kararlar.md` and do not bring back
anything listed there as ruled out.

Vaults created before version 2.0 use earlier names for the same files:
`ben-kimim.md` is 01-Kimlik, `guncel-durum.md` and `aktif-projem.md` are
02-Guncel-Durum, `verdigim-kararlar.md` is 03-Kararlar. Read and write the
file that exists: never rename the user's files and never create a 01, 02 or
03 file next to its older equivalent.

### Three core rules

1. **Conflicts and dates (Çelişki ve Tarih Kontrolü).** When two notes
   disagree, follow the one with the newer `date:` and tell the user which
   line is out of date: "This file looks out of date; shall we update it?"
   A note whose `supersedes` field names another note overrides that note.
   Lines marked `GEÇERSİZ` are history, not current. Never invent facts that
   are not in the files; if something is missing, ask.
2. **No deletion without approval (Onaysız Silme Yok).** When the session
   produces a new decision or lesson, propose it at the end of the session
   ("We made these two decisions today; shall I add them to the decisions
   file?") and write it only after the user agrees. An explicit request such
   as "save this decision" counts as agreement. Decisions go to
   `beynim/03-Kararlar.md` (`verdigim-kararlar.md` in an older vault) as
   `- YYYY-MM-DD — decision — reason`; lessons go to `beynim/04-Tuzaklar.md`,
   one line each (create the file if it is missing).
   Never delete or rewrite old decisions: when one changes, add
   ` GEÇERSİZ (YYYY-MM-DD)` to the end of the old line and append the new
   decision as a new line.
3. **Privacy shield (Gizlilik Kalkanı).** Never write bank details, income
   and expense records, health records, passwords, API keys, card numbers,
   IBANs or a client's confidential documents into this folder. If you see
   one, do not save it and warn the user.

### Other saving rules

- Keep the current-state file (`beynim/02-Guncel-Durum.md`, or
  `guncel-durum.md` in an older vault) current: when the state changes, update
  it and set its `date:` to today. Changing numbers belong there, not in the
  identity file.
- A pattern you notice in the conversation ("they prefer short answers") is an
  observation, not a rule. Propose it for `05-Calisma-Tarzim.md` and add it
  only after the user agrees.
- If the user's message contains `[kaydetme]` or asks you not to save the
  conversation ("bunu hafızaya kaydetme"), save nothing from it.
- Before a large rewrite of a `beynim/` file, show the user the change.

### What lives where

- `beynim/` holds the five core files above. `03-Kararlar.md` keeps dated
  decisions and, under "Elediklerim", the ideas the user ruled out.
- `notlar/` holds free-form notes.
- `gunluk/` holds automatic session summaries, one file per day. Do not edit
  existing entries.
- `gelen-kutusu/` holds proposals waiting for the user's approval. Never treat
  them as decided.
- `sistem/` and `beyin.mjs` are system files. Do not edit them.

### Tools

- `node beyin.mjs ara "<query>"` searches all notes (Turkish-aware).
- `node beyin.mjs baglam` prints the start-of-session context.
- `node beyin.mjs doktor` checks that everything works.
- `node beyin.mjs guncelle` installs the latest released version.
