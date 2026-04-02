---
description: Type design rules
# globs: ["src/**/*.ts"]
alwaysApply: true
---

Avoid inline complex types.

Bad:

Promise<{ estimated: number; actual: number; delta: number }>

Correct:

Promise<BillsReconcileResult>

---

# Query Return Types

Query methods must define explicit return types.

Bad:

async findMonth() {
  return prisma.month.findUnique(...)
}

Correct:

async findMonth(): Promise<MonthWithRunAndJars | null>

---

# Services Must Not Use

Awaited<ReturnType<...>>

Services should import named types instead.