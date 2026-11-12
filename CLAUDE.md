# Project Rules For triplet-03

This file is local only.
It must never be committed or pushed.
It is excluded through `.git/info/exclude`, not `.gitignore`, so the exclusion itself is never pushed either.
Before every commit and every push, confirm `git ls-files CLAUDE.md` prints nothing.

## Identity

- This project uses only the GitHub account `tsypcschallenger`.
- Git user name: `tsypcschallenger`.
- Git user email: `tsyp.cs.534d55@proton.me`.
- SSH host alias: `github.com-tsyp`, remote `git@github.com-tsyp:tsypanyonyme77-dotcom/triplet-03.git`.
- The identity is set in the local repo config only. Never set it globally.
- Never commit or push with any other identity.
- `gh` must also be switched to the tsyp account before any PR or issue work.

## Anonymity Is Mandatory

The identity of the real person behind this account must never be revealed through a commit or a push.
Do these checks before every commit and again before every push.
If any check fails, stop and report it. Do not commit or push.

### Before Every Commit

- Run `git status` and `git diff`, and stage specific files by name.
- Confirm `git config user.name` and `git config user.email` match the Identity section.
- Confirm no `GIT_AUTHOR_*`, `GIT_COMMITTER_*` or `EMAIL` environment variables override the identity.
- Confirm no global or included git config changes the author, committer, signing key or commit template.
- Confirm commit signing is off, or uses only a key that belongs to the tsyp account.
- Scan the staged diff for personal data: real names, other email addresses, usernames of other accounts, local absolute paths such as `/home/<user>`, machine hostnames, internal IP addresses, SSH aliases for other accounts, and tokens or keys.
- Check file metadata that can leak identity, such as author fields in package manifests, licenses, docs, images (EXIF) and documents.
- The commit message must not name a real person, and must not include any co-author or assistant attribution line.

### Before Every Push

- Confirm the remote is the tsyp remote with `git remote -v`.
- Run `git log origin/main..HEAD --format='%an <%ae> | %cn <%ce>'` (or the right base) and confirm every commit has the tsyp name and email as both author and committer.
- Check the full diff of every commit about to be pushed, not just the working tree, using the same personal data scan as above.
- Confirm `CLAUDE.md` and other local-only files are not tracked.
- Use gitleaks or trufflehog if installed, otherwise grep patterns.
- Never print a secret or personal detail in full. Report only the file, line and type.

### If Something Leaks

- If a commit has the wrong identity or contains personal data and is not pushed, tell me before fixing it, since fixing rewrites history.
- If it was already pushed, tell me immediately so the data can be rotated and removed from history. A new commit that deletes it is not enough.

## Other Rules

- Never push unless I explicitly ask.
- Never use `--no-verify` or skip hooks or checks.
- Commit format: `type(scope): one sentence summary`.
- Do not use em dashes or dashes as punctuation in anything written for this project.
- The global rules in `~/.claude/CLAUDE.md` still apply, except where this file is stricter.
- This file wins on any conflict with the global rules.
- Conventional version control setup (baseline commit, gitleaks hook): **NO** (decided 2026-11-08). The rules in this file still apply: commit format, anonymity checks, never push unless asked.
- Project root: this directory. Default branch `main`. Twin work goes on local `type/concern` branches; nothing is pushed until asked.
- Workspace rules: no CLAUDE.md in parent directories up to `$HOME`.

## The Rulebook

- The Phase 1 specification (`twin/docs/reference/phase1-specifications.pdf`, summary `twin/docs/phase1-requirements.md`) governs everything. Always follow it (user, 2026-11-08).
- It requires: one folder per team, each team commits only inside its own folder (CODEOWNERS); root files and folders are shared by the triplet. R1 each layer runs alone with mocks and a one-page `INTERFACE.md`. R2 one trigger per scenario, one log per run in `logs/`. R3 a live timeline across the three layers. R4 coordination documented. Interoperability is judged on separation of logic and transport, config not code, standard protocols, validation with clear errors.

## Our Team And Scope

- We are the **Twin team** (team name Onymous). We change only `twin/`.
- If something outside `twin/` must change (root files, `brain/`, `guardian/`, `.github/`), do not change it: tell the user what and why, so it can go to the owning team.
- Twin working notes for this folder are in `twin/CLAUDE.md` (local only, excluded through `.git/info/exclude`). `.temp/` and `.claude/` are excluded the same way.

## Migration From The Old Twin Repo (2026-11-08)

- The Twin was built in a separate private repo (`../tsyp-14-cs-challenge`), now **frozen**. All Twin work continues here.
- Copied as a file snapshot of its `main` (`e22dac9`) with `git archive`, never its history: its commits carry a personal identity.
- Its root-level Twin pieces moved into `twin/`: `docker-compose.yml` and `.env.example` (standalone run, R1), `scenarios/` (triggers), `docs/TESTBOOK-twin.md`, `docs/INTEGRATION-twin.md`, `docs/simulation-scenarios.md`, `docs/diagrams/`. Its old run logs were not copied: they use the old T1 to T4 numbering.
- The old repo's `poc/` stays there, local; it is needed later for the citizens' decision model.

## Partner Alignment Decisions (2026-11-08)

- Transport: the Twin serves **both plain HTTP and MCP** over the same operations, as two adapters inside `twin/`, so the Brain works as configured. HTTP stays the default.
- Readings: one canonical reading inside the Twin, rendered per partner dialect. The Brain reads contract `2026-09-17` (`type`, `provenance.hmac`) and pulls `GET /readings`, `GET /topology`, `GET /capabilities`, `POST /actuators/{action}` (or MCP tools). The Guardian reads contract `1.0` (`sensor_type`, top-level `hmac`, `sequence_reset`, no extra envelope fields), pushed to `POST /v1/readings` with `X-API-Key`, and forwards calls to `POST /tools/{action}`. Both dialects share one `sensor_id` and `sequence_no`, since the Brain asks the Guardian for a verdict by that pair.
- The Twin's work merged to `main` by rebase through PR #1 on 2026-11-08 (head 4682704), as tsypcschallenger; `feat/partner-adapters` and `feat/twin-layer-import` deleted. `brain/report-part2` is the Brain team's: leave it. `gh` was left active on tsypcschallenger.
- Things only partners can change are listed in `twin/docs/partner-requests.md` and told to the user, never edited by us. Results of the three-layer runs: `twin/docs/joint-run-2026-11-08.md`.
- Readings are what a sensor would report (`twin/src/twin/sensor_model.py`), at the Guardian's intervals (`reading_cadence.py`). The City Brain is offered only what the Guardian can judge. Do not undo these without a three-layer run: each fixed a real failure.

## Working Notes (carried over from the old Twin repo)

- `git` reports "dubious ownership" (the drive is owned by root): use env `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=$PWD`. `core.filemode` is false here.
- Shell is zsh: no word-splitting of variables, `path` is tied to `PATH` (never a loop variable), quote globs.
- Do not start servers or `docker compose up` (global rule): ask the user. `docker compose config` and `cd twin && uv run pytest` are fine.
- Create files with the Write tool, never a bare shell redirect over a name that may exist. List `find` matches before deleting anything by pattern.
- Untrack with `git rm -r --cached`, never plain `git rm -r`.
- The Twin image runs as user 1000 on a read-only package: never write into the package folder on import.
- Simulation parameters are chosen from sweeps over trips with turns and the busy scenario, then the full suite.

## Notes

- **Mistake**: read `which gitleaks trufflehog | wc -l` = 2 and an empty scan as a pass; neither is installed (those were "not found" lines), found only by checking the exit code (127) before the push.
  **Don't**: treat a tool's silence as a clean result.
  **Do instead**: check the exit code. With no scanner here, scan the added lines of `origin/main..HEAD` by pattern, printing only file and type. (2026-11-08)

- **Mistake**: installed a partner's package from its folder with `uv pip install ../../guardian`, which wrote `guardian/build/` into their folder; removed at once, nothing tracked.
  **Don't**: build or sync inside `brain/` or `guardian/`.
  **Do instead**: copy the folder into `.temp/` and build there, then `git status guardian brain`. (2026-11-08)
- **Mistake**: judged integration from each partner alone (conformance, validator) and said the rest would work; a run of all three found that a reading with no verdict stalls the Brain 2 s and degrades it, that our feed outran it, and that zones broke its evidence and clearing.
  **Don't**: call the layers aligned from checks against one partner at a time, or assume what happens to an unjudged message.
  **Do instead**: run all three as local processes under a script that stops them (`.temp/partner-contract-check/joint_run.py`), and read the Brain's full log in its `logs/`, since `GET /events` keeps only 5000. (2026-11-08)
- **Mistake**: a wait loop `while pgrep -f 'name'` matched its own command line and would never end.
  **Don't**: pgrep for a literal that appears in the same shell command.
  **Do instead**: use a bracket in the pattern, `'nam[e]'`. (2026-11-08)
- **Mistake**: after a Twin change I recreated one or two layers (the Twin, then the Guardian and the Brain) while the others kept running. The Brain stopped reading the new Twin, then kept asking a new Guardian about readings it never saw (`guardian_unavailable` for over ten minutes), and a Twin restart made the Guardian isolate cameras for a jump.
  **Don't**: restart a single layer of the stack to test a change.
  **Do instead**: when the user allows starting the stack, `docker compose down` then `docker compose up -d --build`, which starts them in order on clean Guardian state, and wait for the Brain to be healthy. (2026-11-09)
- **Mistake**: changed what a repeated dispatch returns and ran only the tests I expected to be affected; the full suite found another test that pinned the old shape.
  **Don't**: run a subset of the tests before committing a behaviour change.
  **Do instead**: run the whole `cd twin && uv run pytest` before the commit, and fix a test that belongs to an earlier commit on that commit's branch. (2026-11-09)
- **Mistake**: found the Guardian's reasons for distrust one at a time over many runs.
  **Don't**: guess from the Guardian's health or the Brain's `/events` (5000 events, no reasons).
  **Do instead**: run `.temp/reporter-run/trace.py tN` (drives one scenario and prints every reporter's verdicts and reasons, the Brain's incidents and actions, and what the Twin really did), then read the Guardian's `/v1/containment` and `/v1/sensors/<id>/status`. (2026-11-09)
