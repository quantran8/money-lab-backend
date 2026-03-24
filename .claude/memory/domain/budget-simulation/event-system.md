---
name: Budget Simulation Event System
description: Life events (LQI-weighted), overtime events (job-based), spawn logic, event choice resolution, multi-jar payment, and OT mechanics
type: reference
---

# Event System

## Two Independent Event Lanes

### Life Events (LQI-weighted pool)
- Categories: positive, neutral, compromise, undesirable
- Pool weights vary by LQI state (from ModuleEventPoolWeight table)
- Template selection: weighted by `11 - rarity` (rarity 1=common, 10=rare)
- Deduplication: excludes templates used in last 5 months

### Work/Overtime Events (job-structure based)
- Single OT template per module
- Spawn based on `jobLevel.overtimeSpawnWeight` probability
- Caps: `jobLevel.overtimeMonthlyCap`, requires `HI >= minHiForOvertime`
- Not influenced by LQI

---

## Spawn Logic (Deterministic PRNG)
```
Seed format: "{runId}:{monthIndex}:{week}:{lane}"
shouldSpawn(seed) = deterministicRandom(seed) < probability
chooseCategory(seed, weights) = weighted random selection
chooseTemplate(seed, templates) = weighted by (11 - rarity)
```

Life spawn flow:
1. Check stress mode cap
2. Spawn roll (seed: `{runId}:{monthIndex}:{week}:spawn`)
3. LQI-weighted category pick
4. Rarity-weighted template pick (excluding recently used)
5. Affordability filter: cheapest option cost must be <= totalAvailableFunds (sum of jar balances + cumulativeFutureYou + freeCash). If no affordable templates, fall back to templates with a zero-cost option. If none exist, no event spawns.

OT spawn flow:
1. Check module supports OT (module 3)
2. Check no existing OT event this week
3. Check stress mode cap
4. Check job-level monthly cap: total OT events spawned this month (accepted or skipped) < `overtimeMonthlyCap`
5. Check min HI
6. Spawn roll based on `overtimeSpawnWeight`

---

## Event Choice Resolution

### Payment (multi-jar)
1. Primary jar covers as much as possible
2. If primary is `future_you` and jar balance < cost: tap `month.cumulativeFutureYou` (previous months' savings) before cover jars. Recorded as `cumulative_future_you` in payment breakdown, decrements `cumulativeFutureYou` on month record.
3. Cover jars (player-selected order) cover shortfall
4. Each jar: `deduct = min(balance, remaining)`
5. Blocked if total available < cost

### OT Accept
- HI penalty applied immediately (current week)
- Income deferred to next month (`overtimeIncomeEarned` incremented)
- `acceptedOvertimeCount` incremented

### OT Skip
No effects.

### Event Effects on Indices
- Each option has: `moneyDelta`, `healthDelta`, `lqiDelta`, `learningXpDelta`
- OT accept: healthDelta = jobLevel OT penalty, moneyDelta = 0 (deferred)
- Aggregated per-week: all chosen events' deltas summed into weekly index resolution

---

## Code Location

- Domain: `domain/events/event-spawn-engine.ts` — `shouldSpawn()`, `shouldSpawnLane()`, `chooseCategory()`, `chooseTemplate()`
- Domain: `domain/events/overtime-effects.ts` — `resolveOvertimeEffectsFromJobLevel()`, `isOvertimeAcceptOption()`
- Service: `services/month/month-event.service.ts` — `resolveLifeSpawnTemplateId()`, `resolveOvertimeSpawnTemplateId()`, `applyChoice()`, `buildSpawnPayload()`
