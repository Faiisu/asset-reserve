# Git & Version Control Skill

---
name: git-version-control
description: >
  Enforces professional Git workflows including atomic commits, conventional
  commit messages, feature branching, and safe rollback strategies. The agent
  uses this skill to make incremental, reviewable Git commits after each
  completed sub-task rather than one giant commit at the end. Activate this
  skill at project start and after every completed task checkpoint.
---

## Purpose

Version control is the safety net that makes all other engineering practices
possible. This skill ensures:

- Every change is reversible
- History is readable and bisectable
- PRs are focused and reviewable
- Deployments can be rolled back safely

---

## Commit Discipline: Atomic Commits

**One task = One commit.** Each commit must be:

| Property | Meaning |
|----------|---------|
| **Atomic** | Changes exactly one logical thing |
| **Complete** | Tests pass, linter is clean |
| **Self-describing** | The message tells you *what* and *why* |
| **Reversible** | Can be reverted without breaking other things |

### Anti-patterns to Avoid

```bash
# ❌ Never do this:
git add .
git commit -m "stuff"

# ❌ Never do this:
git commit -m "WIP"

# ❌ Never do this:
git commit -m "fix things and also add feature and update deps"

# ✅ Do this:
git add src/application/use-cases/create-user.ts tests/create-user.test.ts
git commit -m "feat(auth): T-03 implement createUser use-case"
```

---

## Conventional Commits Standard

All commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

| Type | When to Use |
|------|------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `docs` | Documentation only changes |
| `chore` | Tooling, config, dependency updates |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration changes |
| `style` | Formatting, whitespace (no logic change) |
| `build` | Build system changes |
| `revert` | Reverting a previous commit |

### Examples

```bash
feat(auth): add JWT refresh token rotation
fix(user): prevent duplicate email on concurrent registration
refactor(payment): extract charge logic into PaymentService
test(order): add integration tests for order cancellation flow
docs(api): document POST /auth/login request/response shape
chore(deps): update prisma to 5.8.1
perf(query): add index on users.email for login speed
ci: add GitHub Actions workflow for PR checks
```

### Breaking Changes

```bash
feat(api)!: rename /user to /users for REST convention

BREAKING CHANGE: All clients must update endpoint from /user to /users.
Migration guide: docs/migrations/v2-api.md
```

---

## Branching Strategy

### GitFlow (default for teams)

```
main          ← production-ready, protected
  └─ develop  ← integration branch
       └─ feature/<ticket-id>-<slug>   ← one branch per feature
       └─ fix/<ticket-id>-<slug>       ← bug fixes
       └─ release/<version>            ← release preparation
       └─ hotfix/<version>-<slug>      ← emergency production fixes
```

### Trunk-Based (for CI/CD teams)

```
main          ← always deployable, commits go here via short-lived branches
  └─ <username>/<ticket-id>-<2-3-word-slug>  ← max 1-2 days old
```

### Branch Naming Convention

```bash
feature/AUTH-42-jwt-refresh-tokens
fix/BUG-17-duplicate-email-on-register
chore/update-prisma-5-8
docs/add-api-auth-guide
```

---

## Git Workflow Protocol

### Starting a New Task

```bash
# 1. Sync with latest
git checkout develop  # or main for trunk-based
git pull origin develop

# 2. Create feature branch
git checkout -b feature/T-03-create-user-use-case

# 3. Verify clean state
git status  # should show: nothing to commit, working tree clean
```

### After Each Completed Sub-task

```bash
# 1. Run tests and linter (must pass)
npm test && npm run lint

# 2. Stage only the files for this task
git add src/application/use-cases/create-user.ts
git add tests/create-user.test.ts

# 3. Commit with conventional message
git commit -m "feat(auth): T-03 implement createUser use-case

- Validates email format and password strength
- Hashes password with bcrypt (cost 12)
- Persists via UserRepository port

Closes #42"

# 4. Push regularly (at least daily)
git push origin feature/T-03-create-user-use-case
```

### Preparing a PR

```bash
# 1. Rebase on latest develop to keep history clean
git fetch origin
git rebase origin/develop

# 2. Squash fixup commits (WIP commits)
git rebase -i origin/develop  # mark fixup commits as 'squash' or 'fixup'

# 3. Verify final state
git log --oneline origin/develop..HEAD  # should show clean, atomic commits
git diff origin/develop --stat          # sanity check: only intended files changed
```

---

## Rollback Procedures

| Scenario | Command | Risk |
|----------|---------|------|
| Undo last commit (keep changes) | `git reset --soft HEAD~1` | Safe |
| Undo last commit (discard changes) | `git reset --hard HEAD~1` | Destructive (local only) |
| Revert a pushed commit | `git revert <sha>` | Safe (creates new commit) |
| Roll back a release tag | `git revert <range>` then re-deploy | Safe |
| Find the bad commit | `git bisect start; git bisect bad; git bisect good <sha>` | Investigative |

**NEVER force-push to `main` or `develop`** — this rewrites shared history and
will cause conflicts for every team member.

---

## Git Configuration (project setup)

```bash
# Set commit message template
git config commit.template .gitmessage

# Enable rerere (reuse recorded resolution)
git config rerere.enabled true

# Show verbose diff in commit editor
git config commit.verbose true
```

`.gitmessage` template:
```
# <type>(<scope>): <subject> (50 chars max)
#
# Body: explain WHY, not WHAT (wrap at 72 chars)
#
# Footer:
# - Closes #<issue>
# - BREAKING CHANGE: <description>
```

---

## Rules the Agent MUST Follow

1. **Never commit with `git add .`** — always stage files explicitly and verify with `git diff --staged`.
2. **Tests must pass before every commit** — a broken commit is worse than no commit.
3. **One commit per task** — align with the task-breakdown skill's task IDs.
4. **Use `git revert` to undo, never `git reset` on shared branches** — resets rewrite history.
5. **Branch names must include the ticket ID** — enables traceability to task tracker.
6. **Report the commit SHA after every commit** — so the user can reference it: `✅ Committed: a3f7b91`.
7. **Tag releases** — after every deployment-ready state: `git tag -a v1.2.0 -m "Release v1.2.0"`.
