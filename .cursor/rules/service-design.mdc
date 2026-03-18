---
description: Service design guidelines
# globs: ["src/**/*.ts"]
alwaysApply: true
---

Service methods represent business use cases.

Examples:

createRun()
startMonth()
resolveWeek()
simulateMonth()

Avoid generic methods:

processWorkflow()
handleOperation()

---

# Service Size

Recommended limits:

Service class < 400 lines  
Service method < 80 lines

If exceeded:

- extract domain helpers
- split services
- move algorithms to domain