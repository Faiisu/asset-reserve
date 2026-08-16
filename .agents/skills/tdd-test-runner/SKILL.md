# TDD / Test Runner Skill

---
name: tdd-test-runner
description: >
  Enforces Test-Driven Development (TDD) discipline by writing tests before
  or alongside implementation code. Enables the AI to run test commands
  autonomously, parse failures, and self-correct until all tests pass.
  Supports Jest, Vitest, PyTest, JUnit, and Go test. Activate this skill
  for any feature, bug fix, or refactoring task.
---

## Purpose

Tests are the only reliable proof that code does what it claims. This skill
ensures:

- Every public function has at least one test
- Edge cases and error paths are covered
- Regressions are caught automatically
- The agent can verify its own work without human intervention

---

## TDD Cycle (Red → Green → Refactor)

```
1. RED    — Write a failing test that describes desired behaviour
2. GREEN  — Write the minimum code to make the test pass
3. REFACTOR — Clean up code while keeping tests green
```

The agent MUST follow this cycle. Writing implementation before the test is
a violation.

---

## Test Framework Quick Reference

### JavaScript / TypeScript

```bash
# Jest (most common)
npx jest --coverage --runInBand

# Vitest (Vite projects)
npx vitest run --coverage

# Watch mode during development
npx jest --watch
```

**File naming**: `<module>.test.ts` or `<module>.spec.ts`

### Python

```bash
# PyTest
pytest -v --cov=src --cov-report=term-missing

# Run single file
pytest tests/test_auth.py -v

# Run single test
pytest tests/test_auth.py::test_login_success -v
```

**File naming**: `test_<module>.py`

### Go

```bash
go test ./... -v -cover
go test ./... -race  # detect race conditions
```

**File naming**: `<module>_test.go`

### Java (JUnit 5)

```bash
mvn test
./gradlew test
```

---

## Test Writing Protocol

### Step 1 — Identify What to Test

For each function/endpoint/component, list:
- **Happy path** — the main success scenario
- **Edge cases** — empty input, max values, boundary conditions
- **Error paths** — invalid input, network failure, auth failure
- **Side effects** — DB writes, events emitted, emails sent

### Step 2 — Write Tests Using AAA Pattern

```typescript
// Arrange - Act - Assert (AAA)
describe('UserService.createUser', () => {
  it('should create a user with hashed password', async () => {
    // Arrange
    const dto = { email: 'test@example.com', password: 'Secret123!' }
    const mockRepo = { save: jest.fn().mockResolvedValue({ id: '1', ...dto }) }
    const service = new UserService(mockRepo)

    // Act
    const result = await service.createUser(dto)

    // Assert
    expect(result.id).toBeDefined()
    expect(result.password).not.toBe('Secret123!')  // must be hashed
    expect(mockRepo.save).toHaveBeenCalledTimes(1)
  })

  it('should throw ConflictError if email already exists', async () => {
    // Arrange
    const mockRepo = { save: jest.fn().mockRejectedValue(new UniqueConstraintError()) }
    const service = new UserService(mockRepo)

    // Act & Assert
    await expect(service.createUser({ email: 'dup@example.com', password: 'x' }))
      .rejects.toThrow(ConflictError)
  })
})
```

### Step 3 — Coverage Targets

| Layer | Minimum Coverage |
|-------|----------------|
| Domain / Use-cases | 90% |
| Infrastructure adapters | 70% |
| HTTP controllers | 80% (via integration test) |
| UI components | 60% |

### Step 4 — Test Types Pyramid

```
        /\
       /  \   E2E Tests (few, slow, high confidence)
      /----\
     /      \  Integration Tests (medium, test boundaries)
    /--------\
   /          \ Unit Tests (many, fast, isolated)
  /____________\
```

- **Unit tests**: Test a single function/class in isolation; mock all dependencies.
- **Integration tests**: Test that two or more units work together (e.g., service + repository).
- **E2E tests**: Test the full system from the user's perspective (browser / HTTP client).

---

## Self-Correction Loop

```
Write test → Run test suite
                ↓
           Tests pass?
        Yes → Report ✅ → continue
        No  → Read failure output → identify root cause
                ↓
           Is it a test bug or an implementation bug?
        Test bug → Fix test → re-run
        Impl bug → Fix implementation → re-run
                ↓
           Still failing after 3 attempts?
        → Surface to user with exact failure + proposed fix
```

### Parsing Test Failures

When a test fails, extract:
1. **Test name** — which scenario failed
2. **Expected vs Received** — what value was expected, what was returned
3. **Stack trace** — which line in which file caused the failure
4. **Error type** — assertion error, runtime error, timeout

Then apply a targeted fix — never rewrite unrelated tests to make failures disappear.

---

## Mocking Best Practices

```typescript
// ✅ Mock at the boundary (repository, HTTP client, time)
const mockUserRepo = { findById: jest.fn(), save: jest.fn() }

// ❌ Never mock the unit under test itself
const mockUserService = jest.mocked(UserService)  // wrong

// ✅ Use real objects for domain logic
const user = new User({ email: 'a@b.com' })  // no mock needed

// ✅ Freeze time for date-sensitive tests
jest.useFakeTimers().setSystemTime(new Date('2024-01-01'))
```

---

## Test Report Format

After each test run, report:

```markdown
## 🧪 Test Results

| Suite | Tests | Passed | Failed | Skipped | Coverage |
|-------|-------|--------|--------|---------|----------|
| UserService | 12 | ✅ 11 | ❌ 1 | — | 94% |
| AuthController | 8 | ✅ 8 | — | — | 87% |

### ❌ Failures

**UserService › createUser › should reject duplicate email**
```
Expected: ConflictError
Received: undefined
at UserService.createUser (src/application/use-cases/create-user.ts:42)
```
**Root Cause**: Missing unique constraint check in repository mock setup.
**Fix Applied**: Added mock rejection for duplicate email scenario.
```

---

## Rules the Agent MUST Follow

1. **Write the test first** — no implementation code before a failing test exists.
2. **Never delete a failing test** — fix the implementation, not the test (unless the test itself is wrong).
3. **No `skip` or `xtest` in committed code** — temporarily skipped tests must have a `// TODO:` with a ticket reference.
4. **Test the interface, not the implementation** — tests should not break when internals are refactored.
5. **Run the full suite after every change** — never deliver code where only the new tests pass but existing ones haven't been verified.
6. **Aim for 80%+ coverage on domain and application layers** — and surface coverage reports to the user.
