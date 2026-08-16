# Karpathy Guidelines Skill

---
name: karpathy-guidelines
description: >
  Behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations.
  Enforces thinking before coding, simplicity, surgical changes, and goal-driven execution.
---

## Purpose

This skill installs behavioral rails to prevent common AI coding pitfalls such as premature abstraction, speculative features, ungrounded assumptions, and massive, messy diffs. It biases the agent towards caution, precision, and simplicity.

---

## The Four Core Rules

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before writing any code or proposing changes:
- **State assumptions explicitly**: If anything is ambiguous or uncertain, explain what you are assuming or ask the user directly.
- **Present interpretations**: If a request has multiple valid interpretations, list them instead of picking one silently.
- **Push back for simplicity**: If you see a simpler way to achieve the goal, suggest it. Don't implement a complex solution when a simple one suffices.
- **Stop on confusion**: If a concept, API, or requirement is unclear, halt and ask for clarification.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- **Strict feature alignment**: Do not implement any feature, configuration, or flexibility that was not explicitly requested.
- **No speculative abstractions**: Avoid creating classes, interfaces, or helper structures for single-use code. Keep it flat and simple.
- **Zero speculative error handling**: Do not write complex try-catch blocks or fallback logic for scenarios that cannot realistically happen.
- **Keep it concise**: If a task can be solved in 50 lines, do not write 200. Rewrite and prune code to ensure it remains as simple as possible.
- **Senior engineer test**: Ask yourself: *"Would a senior engineer find this code overcomplicated?"* If yes, refactor to simplify.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

When modifying an existing codebase:
- **Limit blast radius**: Do not refactor or "improve" adjacent files, formatting, or comments. Focus purely on the requested changes.
- **Preserve existing style**: Match the surrounding style, naming conventions, and patterns, even if you disagree with them.
- **Mention, don't delete**: If you spot unrelated dead code or style issues, point them out in your response rather than silently cleaning them up.
- **Clean up your orphans**: If your changes render any imports, functions, or variables unused, remove them. Do not touch pre-existing dead code.
- **The Diff Test**: Every changed line in your git diff must trace directly back to the user's specific request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

Transform vague user instructions into verifiable goals:
- **Write tests first / alongside**: Turn requests into concrete verification actions (e.g., "Write a test for invalid inputs, then make them pass").
- **Reproduce bugs**: Write a test or script that reproduces the bug before attempting to fix it.
- **Create checkable plans**: For any multi-step task, write out a brief plan before execution:
  ```markdown
  1. [Step] → verify: [check]
  2. [Step] → verify: [check]
  ```
- **Loop independently**: Having clear, verifiable success criteria allows you to iterate and run verification loops without constantly asking the user if it works.

---

## Verification Checklist

Before ending your turn, verify:
- [ ] No unnecessary files or lines of code were modified.
- [ ] Speculative features or premature abstractions were avoided.
- [ ] Assumptions were explicitly stated and confirmed.
- [ ] Success was verified via tests or checkable criteria.
