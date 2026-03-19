Explain how domain → tables.

# Database Mapping

This document maps domain concepts to database tables.

---

# Player Identity

Tables:


AUTH_USERS
PROFILES


---

# Job System

Tables:


JOBS
JOB_LEVELS
USER_JOB_STATE


Responsibilities:


JOBS → base job definitions
JOB_LEVELS → level overrides
USER_JOB_STATE → player job progress


---

# Budget Run

Table:


BUDGET_RUNS


Represents one complete simulation run.

---

# Commitments

Tables:


COMMITMENT_TEMPLATES
USER_RUN_COMMITMENTS


Templates define available commitments.

User table stores selected commitments for a run.

---

# Monthly State

Table:


BUDGET_RUN_MONTHS


Stores:

- income
- estimated bills
- actual bills
- structural flags
- free cash

---

# Jar State

Table:


BUDGET_MONTH_JARS


One row per jar per month.

---

# Bill Resolution

Table:


BUDGET_MONTH_BILL_RESOLUTION


Stores reconciliation breakdown.

---

# Index Resolution

Table:


BUDGET_MONTH_INDEX_RESOLUTION


Stores month-level summary of weekly HI/LQI results.

---

# Event System

Tables:


LIFE_EVENT_TEMPLATES
LIFE_EVENT_OPTIONS
BUDGET_MONTH_EVENTS
MODULE_EVENT_POOL_WEIGHTS