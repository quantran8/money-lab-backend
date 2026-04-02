---
description: NestJS feature generator
globs: ["src/**/*.ts"]
alwaysApply: false
---

When creating a new feature module, generate:

- DTO
- Controller
- Service
- Query
- Repository
- Types
- Domain helper (if logic exists)

Folder structure:

feature/

  domain/
  dto/
  queries/
  repositories/
  types/

  feature.controller.ts
  feature.service.ts
  feature.module.ts