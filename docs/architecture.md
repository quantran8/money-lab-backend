Backend Architecture Guidelines
1. Overview

This document defines the backend architecture standards for the project. The goal is to ensure:

Scalable codebase

Clear separation of responsibilities

Maintainable services

Consistent implementation across the team

The backend is built using NestJS and uses Supabase as the database layer.

The architecture follows a modular layered design:

Controller → Service → Query → Database

Each layer has a clear responsibility.

2. Architecture Layers
2.1 Controller Layer

The controller handles:

HTTP requests

Request validation (DTO)

Calling services

Returning responses

Controllers must not contain business logic.

Example:

@Get()
async getUsers() {
  return this.userService.getUsers();
}

Responsibilities:

Handle routes

Validate request DTO

Call service

Return response DTO

2.2 Service Layer (Business Logic)

The service layer contains the core business logic.

Services should:

Coordinate multiple queries

Apply business rules

Use mappers to format responses

Services must not query the database directly.

Example:

async getUsers() {
  const users = await this.userQuery.findAll();
  return users.map(UserMapper.toResponse);
}

Responsibilities:

Business logic

Orchestrating queries

Calling mappers

Returning DTOs

2.3 Query Layer (Database Access)

The query layer is responsible for all database interactions.

All Supabase queries must be located here.

Example:

async findAll() {
  const { data } = await this.supabase
    .from('users')
    .select('*');

  return data;
}

Responsibilities:

Database queries

Data retrieval

Data persistence

The query layer must not contain business logic.

2.4 DTO Layer

DTOs define the structure of:

Request payloads

Response objects

Example request DTO:

export class CreateUserDto {
  name: string;
  email: string;
}

Example response DTO:

export class UserResponseDto {
  id: string;
  name: string;
}

DTOs ensure:

Input validation

Type safety

Consistent API contracts

2.5 Mapper Layer

Mappers convert database entities into response DTOs.

Example:

export class UserMapper {
  static toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
    };
  }
}

Benefits:

Centralized transformation logic

Reduced duplication

Clean services

3. Project Folder Structure

The project is organized by domain modules.

src
 ├ modules
 │
 │  └ users
 │     ├ controllers
 │     │  └ user.controller.ts
 │     │
 │     ├ services
 │     │  └ user.service.ts
 │     │
 │     ├ queries
 │     │  └ user.query.ts
 │     │
 │     ├ dto
 │     │  ├ create-user.dto.ts
 │     │  └ user-response.dto.ts
 │     │
 │     ├ mappers
 │     │  └ user.mapper.ts
 │     │
 │     └ user.module.ts
 │
 ├ common
 │   ├ guards
 │   ├ filters
 │   ├ interceptors
 │   └ utils
 │
 └ main.ts

Modules should be organized by business domain, not by technical layer.

Example domains:

auth
users
wallets
transactions
portfolios
analytics
4. Request Flow

Standard request lifecycle:

Client Request
      ↓
Controller
      ↓
Service
      ↓
Query
      ↓
Database (Supabase)

Response transformation:

Database Entity
      ↓
Mapper
      ↓
Response DTO
      ↓
Client Response
5. Coding Rules
Services

Services must:

Contain business logic

Coordinate queries

Call mappers

Services must not:

Directly access Supabase

Perform HTTP request validation

Format responses manually

Controllers

Controllers must:

Be thin

Only call services

Use DTOs

Controllers must not:

Contain business logic

Query databases

Queries

Queries must:

Handle all Supabase calls

Return raw data

Queries must not:

Contain business logic

Return DTOs

6. File Size Guidelines

To maintain readability:

File	Recommended Size
Controller	< 200 lines
Service	< 400 lines
Query	< 300 lines

If a file grows beyond these limits, it should be refactored.

7. Dependency Flow Rules

Allowed dependency direction:

Controller → Service → Query

Not allowed:

Controller → Query
Query → Service

8. Data Access Layer

The project should not depend directly on a specific database provider or ORM.
All database interactions must be abstracted through the Query Layer (Data Access Layer).

This allows the system to switch database technologies in the future without impacting the service or controller layers.

Example possible database implementations:

PostgreSQL

MySQL

MongoDB

Supabase

Prisma

TypeORM

The database provider should be injected through a shared infrastructure provider.

Example:

common/providers/database.provider.ts

Query classes should use this provider to interact with the database.

Example:

export class UserQuery {
  constructor(private readonly db: DatabaseClient) {}

  async findAll() {
    return this.db.users.findMany();
  }
}

The rest of the application should not depend on a specific database implementation.

Allowed dependency flow:

Controller → Service → Query → Database Provider

Key principles:

Services must not access the database directly

All database queries must live in the Query layer

Database providers must be injectable

Database implementation must be replaceable

This design ensures the system remains flexible and database-agnostic.

9. Best Practices

Recommended practices:

Use DTO validation

Keep controllers thin

Isolate database queries

Use mappers for response formatting

Organize modules by domain

Avoid:

Large service files

Business logic inside controllers

Repeated mapping logic

Direct database access from services

10. Summary

The architecture ensures:

Clear separation of concerns

Scalable module structure

Maintainable business logic

Consistent coding practices

Architecture overview:

Controller
   ↓
Service
   ↓
Query
   ↓
Database

This structure enables the project to scale efficiently as the codebase and team grow.