# Design Pattern Enforcer Skill

---
name: design-pattern-enforcer
description: >
  Installs a coding-principle "conscience" into the AI agent. Before writing,
  reviewing, or refactoring any code the agent checks it against SOLID
  principles, DRY, KISS, YAGNI, and a curated catalogue of Gang-of-Four and
  modern design patterns. Activate this skill at the start of any
  implementation task or code review.
---

## Purpose

This skill acts as an embedded senior engineer who continually asks:
*"Is this the right abstraction? Are we repeating ourselves? Will this scale?"*

It prevents the agent from shipping code that is correct-but-wrong:
code that passes tests today but collapses under the next requirement change.

---

## Core Principles Checklist

Run this mental checklist before finalising **any** class, function, or module:

### SOLID

| Principle | Check |
|-----------|-------|
| **S** — Single Responsibility | Does this class/function do exactly ONE thing? |
| **O** — Open/Closed | Can we extend behaviour without modifying existing code? |
| **L** — Liskov Substitution | Can a subclass be swapped in without breaking callers? |
| **I** — Interface Segregation | Are interfaces lean? No client forced to depend on unused methods? |
| **D** — Dependency Inversion | Do high-level modules depend on abstractions, not concretions? |

### DRY (Don't Repeat Yourself)

- Is any logic duplicated across 2+ files? → Extract to a shared function/module.
- Is any config value hardcoded in 2+ places? → Extract to a constant or env var.
- Is the same SQL query written twice? → Extract to a repository method.

### KISS (Keep It Simple, Stupid)

- Is the solution the simplest thing that could possibly work?
- Can a junior developer understand this without a guide?
- Are there nested conditionals 3+ levels deep? → Extract to early returns or a strategy pattern.

### YAGNI (You Aren't Gonna Need It)

- Does this abstraction serve a current requirement or a hypothetical future one?
- Is this configuration option actually used anywhere yet?
- If the answer is "we might need it someday" → delete it.

---

## Design Pattern Catalogue

### Creational Patterns

| Pattern | Use When |
|---------|----------|
| Factory Method | You need to create objects without specifying the exact class |
| Abstract Factory | You need families of related objects |
| Builder | Object construction has many optional parameters |
| Singleton | Exactly one instance is needed (use sparingly — prefer DI) |

### Structural Patterns

| Pattern | Use When |
|---------|----------|
| Adapter | Wrapping a third-party interface to match your domain port |
| Decorator | Adding behaviour to objects without subclassing |
| Facade | Simplifying a complex subsystem behind a single interface |
| Repository | Abstracting data persistence from business logic |
| Composite | Treating individual objects and groups uniformly |

### Behavioural Patterns

| Pattern | Use When |
|---------|----------|
| Strategy | Swappable algorithms / business rules |
| Observer / Event | Decoupled side effects (logging, notifications, analytics) |
| Command | Encapsulating actions as objects (undo/redo, queues) |
| Chain of Responsibility | Middleware pipelines, validation chains |
| State | Object behaviour changes based on internal state |
| Template Method | Skeleton algorithm with customisable steps |

### Modern / Architectural Patterns

| Pattern | Use When |
|---------|----------|
| CQRS | Read and write models have different scaling needs |
| Event Sourcing | Full audit trail of state changes is required |
| Saga | Distributed transactions across microservices |
| Outbox Pattern | Reliable event publishing alongside DB writes |
| Circuit Breaker | Protecting against cascading failures to external services |

---

## Code Review Protocol

When reviewing or generating code, run a **Pattern Audit**:

### 1. Smell Detection

Flag these code smells before proceeding:

| Smell | Symptom | Fix |
|-------|---------|-----|
| God Class / God Function | >300 lines, >10 dependencies | Split by SRP |
| Feature Envy | Method uses another class's data more than its own | Move method |
| Shotgun Surgery | One change requires edits in many files | Consolidate |
| Primitive Obsession | Using strings/ints for domain concepts | Create Value Objects |
| Long Parameter List | >4 parameters | Introduce Parameter Object / Builder |
| Conditional Complexity | Nested if/else >3 deep | Strategy or polymorphism |
| Copy-Paste Code | Same block in 2+ places | Extract function |

### 2. Pattern Recommendation

For each smell detected, suggest a concrete pattern fix:

```markdown
⚠️ **Code Smell Detected**: Long Parameter List in `createUser(name, email, password, role, tenantId, isAdmin)`

**Recommended Fix**: Builder Pattern or Parameter Object

```typescript
// Before
createUser(name, email, password, role, tenantId, isAdmin)

// After
const user = new UserBuilder()
  .withName(name)
  .withEmail(email)
  .withRole(role)
  .inTenant(tenantId)
  .build()
```
```

### 3. Architecture Alignment

Verify the code respects the project's chosen architecture:

| Architecture | Check |
|---|---|
| Clean Architecture | No import from `infrastructure` → `domain` |
| Hexagonal | No framework code in `core/` |
| MVC | No DB queries in `controllers/` |
| CQRS | No mutation in query handlers |

Report violations as:
```
❌ ARCHITECTURE VIOLATION: `UserController` imports `PrismaClient` directly.
   Fix: Inject `UserRepository` interface and implement in infrastructure layer.
```

---

## Refactoring Rules

1. **Refactor in isolation** — never mix refactoring with feature work in the same commit.
2. **Green tests before refactor** — confirm existing tests pass before touching structure.
3. **One smell per commit** — each refactoring commit addresses exactly one code smell.
4. **Preserve behaviour** — a refactoring must not change observable behaviour (tests are the proof).

---

## Rules the Agent MUST Follow

1. **Run the SOLID checklist on every class/service created** — document the check as a comment block or in the PR description.
2. **Suggest a pattern before writing a complex conditional** — never write a 50-line if/else without first considering Strategy or State pattern.
3. **Flag YAGNI violations immediately** — "we might need this" is not a valid reason to add abstraction.
4. **Keep functions under 30 lines** — if a function exceeds this, it almost certainly violates SRP.
5. **No magic numbers** — every literal value must be a named constant with a comment explaining its origin.
