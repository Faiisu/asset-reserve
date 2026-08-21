---
name: git-commit-every-change
description: Use whenever a change to this repo (code, docs, config, seed data, migrations) is finished and verified — commit it to git with a message explaining what changed and why, even for small/minor changes. Standing, user-authorized instruction for this repo.
---

# Always commit to git, including minor changes

This repo uses `.git` as its version control system. The user has explicitly
authorized (as a standing instruction for this project) committing after
every finished change — including small ones — so this skill's commits do
not require asking permission each time. This overrides the general
"only commit when explicitly asked" default for this repo specifically.

## When to commit

After any change is complete and verified (type-checks, tests pass, or the
change was otherwise confirmed working) — not just for large features:

- A one-line bug fix.
- A CSS tweak, copy/label change, or small UI adjustment.
- A doc correction.
- A seed-script or migration change.
- Any of the larger feature-sized changes this project already does regularly.

Do not batch unrelated small changes into one commit "to save time" — each
logically distinct change gets its own commit, so history stays readable and
bisectable. If a single request produces several unrelated edits, split them
into separate commits.

## What "explain" means

Follow the repo's existing commit-message conventions (check `git log` for
current style). The message must explain *why*, not just restate the diff:
- Bad: "update AssetsPage.tsx"
- Good: "fix checkbox selection getting wiped on every debounced search re-fetch"

For a minor change, one concise sentence is enough — don't pad it out. The
subject line alone is fine when the change is truly self-explanatory (e.g.
"remove dead .cell-number CSS after dropping the Useable units column").

## Procedure

1. Finish and verify the change (tests/type-check/manual check as
   appropriate — see other project skills like `docs-recheck` when the
   change also touches spec-relevant behavior).
2. `git status` / `git diff` to review exactly what's staged vs. not —
   never blindly `git add -A`; stage the specific files that belong to this
   change.
3. Check for anything that looks like a secret or credential before staging,
   same as the normal git-safety rules.
4. Commit with a message describing the change and its reason, using the
   HEREDOC form and the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
   trailer, consistent with this project's existing commit style.
5. Do not push, force-push, or amend published commits as part of this
   skill — those still require explicit user request per the normal git
   safety rules. This skill only covers routine local commits.
