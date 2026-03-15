# API Performance Rules (Backend – NestJS / Prisma)

This document defines **performance guidelines and best practices** for building APIs in this service. The goal is to keep endpoints **fast, predictable, and scalable**.

Target baseline:

| API Type                         | Target Latency |
| -------------------------------- | -------------- |
| Simple read API                  | **< 100 ms**   |
| Normal business logic            | **100–300 ms** |
| Complex workflow (transaction)** | **300–700 ms** |
| Absolute maximum                 | **< 1 second** |

Anything **>1s should be investigated and optimized**.

---

# 1. Minimize Database Round Trips

The **largest performance cost** in most APIs is database round trips.

Each query typically costs:

```
Network latency
Connection overhead
Query execution
Result serialization
```

Typical latency:

```
1 DB query ≈ 150–300 ms
```

Example:

```
10 queries × 200 ms = 2 seconds
```

### Rule

Prefer **fewer queries with richer data**.

### Bad

```ts
const month = await findMonth()
const jars = await findJars()
const events = await findEvents()
```

### Good

```ts
const month = await prisma.month.findUnique({
  where: { id },
  include: {
    jars: true,
    events: true,
    indexResolution: true
  }
})
```

Target per API:

```
1–2 read queries
1 transaction
```

---

# 2. Load Context Data in One Query

Load all required data **at the start of the request**.

Recommended pattern:

```
API
│
├─ loadContext()
│    month
│    jars
│    events
│    jobState
│
├─ compute business logic (in memory)
│
└─ transaction (writes only)
```

Benefits:

* fewer DB round trips
* simpler logic
* faster transactions

---

# 3. Transactions Should Contain Writes Only

Transactions should **avoid reads when possible**.

### Bad

```
transaction
  read
  write
  read
  write
```

### Good

```
read data
compute logic
transaction
  write
  write
  write
```

Benefits:

* shorter locks
* faster database execution
* reduced contention

---

# 4. Avoid Queries Inside Loops

Queries inside loops create **N+1 problems**.

### Bad

```ts
for (const jar of jars) {
  const available = await getJarAvailable(jar.id)
}
```

If there are 5 jars:

```
1 initial query + 5 additional queries
```

### Good

Load everything first:

```ts
const jars = await findJars(monthId)

for (const jar of jars) {
  const available = jar.allocated - jar.spent
}
```

Compute values **in memory**.

---

# 5. Avoid Re-fetching the Same Data

Once data is loaded, **reuse it**.

### Bad

```ts
const month = await findMonth(id)

await computeSomething()

const monthAgain = await findMonth(id)
```

### Good

```ts
const month = await findMonth(id)

await computeSomething(month)
```

Pass objects to internal functions instead of querying again.

---

# 6. Use Parallel Queries When Possible

Independent queries should run concurrently.

### Bad

```ts
const month = await findMonth()
const jars = await findJars()
const events = await findEvents()
```

### Good

```ts
const [month, jars, events] = await Promise.all([
  findMonth(),
  findJars(),
  findEvents()
])
```

This can reduce:

```
600 ms → 200 ms
```

---

# 7. Avoid Sequential Writes When Order Is Not Required

### Bad

```ts
for (const record of records) {
  await insertLog(record)
}
```

### Good

```ts
await Promise.all(records.map(r => insertLog(r)))
```

Use parallel writes **only when order does not matter**.

---

# 8. Prefer In-Memory Computation

Business rules should run **in JavaScript**, not the database.

Examples:

Good candidates for in-memory computation:

* score calculation
* event selection
* resource allocation
* game logic
* validation

Database should be used for:

* persistence
* indexing
* aggregation when large data is involved

---

# 9. Avoid Large Transaction Scopes

Transactions should be **short and focused**.

Bad pattern:

```
transaction
  compute logic
  fetch config
  compute again
  write
```

Good pattern:

```
load config
compute logic
transaction
  write results
```

---

# 10. Log Slow APIs

Every API should log execution time.

Example:

```ts
const start = Date.now()

const result = await service()

logger.log(`API took ${Date.now() - start}ms`)
```

Alert thresholds:

| Time | Action |
| ---- | ------ |

> 500 ms | review |
> 1000 ms | optimize |
> 2000 ms | critical |

---

# 11. Measure Query Counts

Enable Prisma query logging in development:

```ts
new PrismaClient({
  log: ['query']
})
```

Goal:

```
Most APIs: 3–6 queries
Complex APIs: < 10 queries
```

---

# 12. Recommended Endpoint Structure

Standard architecture:

```
Controller
  ↓
Service
  ↓
loadContext()        ← DB reads
  ↓
computeLogic()       ← pure JS
  ↓
transaction()        ← DB writes
  ↓
buildResponse()
```

Example:

```
resolveWeek()
   ↓
loadResolveWeekContext()
   ↓
computeGameLogic()
   ↓
transaction()
   ↓
response
```

---

# 13. Performance Checklist

Before merging a new API:

* [ ] API uses **≤ 6 DB queries**
* [ ] No **queries inside loops**
* [ ] No **duplicate queries for same entity**
* [ ] Independent queries use **Promise.all**
* [ ] Transaction contains **writes only**
* [ ] Response time **< 700 ms**

---

# Final Principle

The fastest backend APIs follow this rule:

```
Load data once
Compute in memory
Write once
```

Minimize database round trips and keep business logic outside the database whenever possible.
