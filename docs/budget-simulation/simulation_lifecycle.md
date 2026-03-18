This is the most important file for backend agents.

# Simulation Lifecycle

This document defines the deterministic order of operations.

---

# Month Start

1. Determine job state
2. Load active commitments
3. Generate estimated bills
4. Calculate bill reserve target
5. Deduct structural costs


income

commitments

estimated bills

bill reserve
= flexible income


---

# Allocation Phase

Player allocates flexible income into jars.

Player selects spending pace:


Enjoy
Normal
Save


---

# Weekly Simulation

Each month contains 4 resolution cycles.

Per week:

1. apply auto-spend
2. generate event (optional)
3. resolve chosen event option
4. resolve LQI
5. resolve HI
6. check forced rest (if stress mode active)

---

# Month End

1. finalize actual bills
2. perform bill reconciliation
3. detect structural overcommitment
4. apply XP gain
5. update job level if needed
6. compute final jar balances
7. carry balances forward