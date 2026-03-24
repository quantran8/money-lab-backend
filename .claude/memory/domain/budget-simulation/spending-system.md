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

## Code Location

- Domain: `domain/spending/spending-calculator.ts` — `jarAvailable()`, `buildJarAvailableMap()`, `computeWeeklySpend()`
- Helpers: `budget-simulation.helpers.ts` — `genAutoSpendLabel()`
- Service: `services/month/month-spend.service.ts` — `getSpendModeRate()`, `applyWeeklySpend()`, `addSpendLog()`
