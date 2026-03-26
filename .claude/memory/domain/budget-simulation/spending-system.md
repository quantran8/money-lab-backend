---
name: Budget Simulation Spending System
description: Jar types, refill logic, auto-spend formula, spend modes, and jar availability calculation
type: reference
---

# Spending System

## Jar Types

**Refill Jars** (monthly target → auto-refill to target):
- **Fun** — lifestyle, LQI positive
- **Learning** — growth, XP gain
- **Give** — contribution

**Contribution Jar** (additive savings):
- **Future You** — protected savings, no LQI/HI effect, never auto-spent

**Structural (non-allocatable):**
- Locked Commitments (housing, transport, phone)
- Estimated Bills (with housing modifiers)
- Bill Reserve

**Free Cash:** Unallocated liquidity, no LQI/HI effect.

---

## Jar Refill Logic (start of month)
```
For refill jars (fun/learning/give):
  refillAmount = max(0, target - previousRemainingBalance)

For future_you:
  contribution = player's chosen amount (additive, not refill-to-target)
```

---

## Auto-Spend (weekly)
```
For each jar in [fun, learning, give]:
  maxMonthAvailable = round(allocated * spendModeRate)
  weeklyAmount = floor(maxMonthAvailable / 4)
  actualSpend = min(jarAvailable, weeklyAmount)
```

**Spend Mode Rates:**
- Enjoy: 1.00 (100%)
- Normal: 0.85 (85%)
- Save: 0.70 (70%)

**Jar Available:**
```
jarAvailable = max(0, allocated - spent + overflowIn - overflowOut)
```

---

## Auto-Spend Labels
Deterministic via `genAutoSpendLabel()` — MD5-seeded selection from prefix/verb/style/tail arrays. Unique per jar/week/run.

---

## Learning Jar XP (from Auto-Spend)

Weekly learning spend generates XP via soft cap system:

```
Step 1 — Load config.progressionSystem
Step 2 — Compute learningCap:
  baseCap = config.progressionSystem.learningXp.baseCap
  jobModifier = jobLevels.levels[currentLevel].learningCapModifier
  hiEfficiency = getHiEfficiency(playerHI, config)
    HI >= 70 → high (1.0); 40 ≤ HI < 70 → mid (0.9); HI < 40 → low (0.75)
  learningCap = baseCap * jobModifier * hiEfficiency

Step 3 — Compute XP (soft cap):
  if learningSpend <= learningCap:
    xp = learningSpend * xpRate
  else:
    xp = learningCap * xpRate + (learningSpend - learningCap) * reducedXpRate
  xp = round(xp)

Step 4 — Level up (checked elsewhere):
  if xp >= nextLevel.xpRequiredTotal → level++
```

**Config (progressionSystem.learningXp):**
- `baseCap`: 100
- `xpRate`: 0.8
- `reducedXpRate`: 0.3
- `hiEfficiency`: { low: 0.75, mid: 0.9, high: 1.0 }

**Config (progressionSystem.jobLevels.levels):**
- Level 1: learningCapModifier = 1.0
- Level 2: learningCapModifier = 1.05
- Level 3: learningCapModifier = 1.10

XP is persisted via `incrementUserJobStateXpBounded()` in the weekly transaction alongside spend ops.

---

## Code Location

- Domain: `domain/spending/spending-calculator.ts` — `jarAvailable()`, `buildJarAvailableMap()`, `computeWeeklySpend()`, `computeLearningXp()`, `getHiEfficiency()`
- Helpers: `budget-simulation.helpers.ts` — `genAutoSpendLabel()`
- Service: `services/month/month-spend.service.ts` — `getSpendModeRate()`, `applyWeeklySpend()`, `addSpendLog()`
