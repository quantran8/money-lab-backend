# MoneyLab — Module 2 Overview

Module 2 is a **budget structure simulator** designed to help players understand financial trade-offs in a psychologically safe environment.

The system simulates **6 fictional months**.

Core mechanics:
- income from a fictional job
- locked monthly commitments
- system-generated bills
- automatic bill reserve
- flexible lifestyle allocation (jars)
- weekly health and lifestyle indexes
- bounded financial volatility

The system explicitly avoids:
- debt mechanics
- negative balances
- irreversible failure states
- hidden penalties

The design goal is **structural clarity**, not financial realism.

---

## Core Principles

1. No debt
2. No negative balances
3. No carry-over deficits
4. Only one uncertainty source: bill variance
5. Weekly index resolution must match UI playback
6. All player choices must show numerical impact before confirmation

---

## Run Structure

A run contains:


6 Months
4 Weeks per Month


High-level monthly flow:


Income
→ Fixed deductions
→ Flexible allocation
→ Weekly simulation
→ Bill reconciliation
→ Monthly summary


---

## Success Condition

Module 3 unlocks if:


Future You savings > 0


---

## Major Systems

1. Job system
2. Commitment system
3. Bill system
4. Jar allocation system
5. Event system
6. HI (Health Index)
7. LQI (Life Quality Index)
8. Stress Mode