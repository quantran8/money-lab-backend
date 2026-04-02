---
description: API performance rules
# globs: ["src/**/*.ts"]
alwaysApply: true
---

The backend must minimize database round trips.

Target latency:

Simple API: <100ms  
Normal workflow: 100–300ms  
Complex workflow: <700ms  
Maximum: <1s

---

# Query Limits

Typical endpoints should use:

1–3 read queries  
1 transaction for writes

Maximum recommended:

6 queries per endpoint

---

# Avoid N+1 Queries

Never run database queries inside loops.

Bad:

for (const jar of jars) {
  await query.findJar(jar.id)
}

Correct:

Load all data first, then compute in memory.

---

# Load Context First

All APIs should follow:

loadContext()
computeLogic()
transaction()
buildResponse()

---

# Transactions

Transactions should contain writes only.

Bad:

transaction
read
write
read
write

Good:

read data
compute logic
transaction
write
write

---

# Parallel Queries

Independent queries should run in parallel.

Use Promise.all.