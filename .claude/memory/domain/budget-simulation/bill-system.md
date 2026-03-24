---
name: Budget Simulation Bill System
description: Bill estimation, deterministic variance, bill reserve, reconciliation waterfall, and structural overcommitment
type: reference
---

# Bill System

## Bill Estimation
Generated at month start from commitment templates (bills layer) with housing utility modifiers applied.

## Bill Variance
Deterministic: `actual = round(estimated * (1 + factor))`.

**Normal months (3, 4):** `factor = (deterministicRandom(seed) - 0.5) * 0.1` (±5% max).

**Seasonal months (always positive increase):**
- Month 1-2 (winter): +5% to +12% — reason: cold weather, heating system works more, electric bill increases.
- Month 5-6 (summer): +6% to +15% — reason: hot weather, more AC and water usage, electric & water bills increase.

When `delta > 0`, `bill_reconcile_breakdown` JSON includes a `reason` field explaining the increase.

## Bill Reserve
```
billReserveTarget = coveragePct * billsEstimated
```
Options: 0% (none), 50% (half), 75% (high), 100% (full).

---

## Bill Reconciliation (end of month, week 4)

**If actual <= estimated (surplus):**
```
surplusToFreeCash = estimated - actual
```

**If actual > estimated (shortfall):**
Deduct in strict order:
1. Bill Reserve
2. Fun jar
3. Give jar
4. Learning jar
5. Free Cash
6. Future You

Each source contributes `min(available, remaining)` until shortfall = 0.

**Structural Overcommitment:** If shortfall remains after exhausting all sources → flag `structuralOvercommitmentOccurred = true`. No debt created, no carry-over.

---

## Stress Mode

**Trigger:** Structural Overcommitment in month M → Stress Mode active in month M+1.

**Effects (month M+1):**
- Start-of-month: HI/LQI shock (sharp drops, floors apply)
- Forced Rest: if HI < hiFloor at any weekly checkpoint → 1 day income loss, HI +5
- Event cap: reduced (`stressMode.maxEventCountPerMonth`)
- Max 1 forced rest per month

**End:** Automatically deactivates after month M+1. No carry-forward.

---

## Code Location

- Domain: `domain/bills/bill-reconcile-calculator.ts` — `computeBills()`, `reconcile()`
- Helpers: `budget-simulation.helpers.ts` — `computeBillsFinal()`
- Service: `services/month/month-bill.service.ts` — `computeBills()`, `reconcileBillsWithContext()`, `reconcileBills()`
