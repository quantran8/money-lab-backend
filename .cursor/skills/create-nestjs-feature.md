# Skill: Create NestJS Feature Module

Use this skill when implementing a new domain module.

## Steps

1. Create a feature folder under `src/feature-name/`.

2. Generate structure:

feature-name/

* domain/
* dto/
* queries/
* repositories/
* types/

feature-name.controller.ts
feature-name.service.ts
feature-name.module.ts

3. Generate DTOs in `dto/`.

4. Create Query classes for database reads.

5. Create Repository classes for database writes.

6. Implement Service with business workflow.

7. Controller calls service methods.

## Architecture Rules

Controller → Service → Query / Repository → Prisma

Services must not call Prisma directly.

## Example Prompt

Create feature **budget-run** with createRun endpoint.
