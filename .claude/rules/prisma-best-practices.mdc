---
description: Prisma usage rules
# globs: ["src/**/*.ts"]
alwaysApply: true
---

Prisma must only be used in:

- Query layer
- Repository layer

Never in:

- controllers
- services
- domain helpers

---

# Query Shape Rules

Queries should prefer include/select to avoid extra queries.

Bad:

multiple queries for related data

Good:

prisma.month.findUnique({
  include: {
    jars: true,
    events: true
  }
})

---

# Query Logging

Enable Prisma logging in development.

Goal query counts:

Simple API: 3–5 queries  
Complex API: <10 queries