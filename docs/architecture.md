Architecture Guide v1.0 (Simplified)
1. Overview

This document defines the backend architecture standards for the project.

Goals

Maintainable codebase

Clear separation of responsibilities

Scalable architecture

Consistent implementation

Technology Stack

Framework

NestJS

Database ORM

Prisma

Authentication

Supabase

Architecture

The backend follows a modular layered architecture.

Controller
   ↓
Service (Business Logic)
   ↓
Query / Repository
   ↓
Prisma
   ↓
Database

Each layer has a clear responsibility.

2. Architecture Layers
2.1 Controller Layer

Role

Handle HTTP requests and responses.

Responsibilities

Define API routes

Validate request input using DTOs

Call service methods

Return responses

Controllers must remain thin.

Controllers must not:

contain business logic

access the database

call Prisma

construct queries

Example

@Post('start-month')
startMonth(
  @Request() req,
  @Body() dto: StartMonthDto
) {
  return this.budgetService.startMonth(
    req.user.id,
    dto.runId,
    dto.allocations
  );
}
2.2 Service Layer (Business Logic)

Role

Implement business rules and application workflows.

Responsibilities

Implement business logic

Validate domain rules

Coordinate query and repository operations

Handle transactions

Throw HTTP exceptions when rules fail

Services must not:

know HTTP details

call Prisma directly

construct ORM queries

Example

async startMonth(userId: string, runId: number) {

  const run = await this.runQuery.findRunWithLatestMonth(BigInt(runId));

  if (!run || run.userId !== userId) {
    throw new ForbiddenException('Run not found');
  }

  const income = run.jobState.currentMonthlyIncome;

  return {
    monthId: run.months[0].id.toString(),
    income
  };

}

Services should read like business logic, not database queries.

2.3 Query Layer (Read Operations)

The Query layer handles database read operations.

Responsibilities

Fetch data from database

Encapsulate query shapes

Define relations (include/select)

Hide Prisma implementation from services

Example

@Injectable()
export class BudgetRunQuery {

  constructor(private readonly prisma: PrismaService) {}

  async findRunWithLatestMonth(runId: bigint) {
    return this.prisma.budgetRun.findUnique({
      where: { id: runId },
      include: {
        months: {
          orderBy: { monthIndex: 'desc' },
          take: 1
        }
      }
    });
  }

}

Services should call intent-based query methods, not build queries.

Example usage

const run = await this.runQuery.findRunWithLatestMonth(runId);
2.4 Repository Layer (Write Operations)

Repositories handle database mutations.

Responsibilities

Create entities

Update entities

Delete entities

Encapsulate Prisma write operations

Example

@Injectable()
export class BudgetRunRepository {

  constructor(private readonly prisma: PrismaService) {}

  async updateRun(id: bigint, data: Prisma.BudgetRunUpdateInput) {
    return this.prisma.budgetRun.update({
      where: { id },
      data
    });
  }

}

Repositories must not:

contain business logic

throw HTTP exceptions

3. DTO Layer

DTOs define API contracts and validate input.

Libraries used

class-validator

class-transformer

Example

export class StartMonthDto {

  @IsInt()
  runId: number;

  @IsObject()
  allocations: Record<string, number>;

  @IsOptional()
  @IsObject()
  carryOverByJar?: Record<string, number>;

}

DTOs should contain all request validation logic.

4. Transactions

Operations involving multiple writes must use database transactions.

Transactions are handled at the service layer.

Example

await this.prisma.$transaction(async (tx) => {

  await this.runRepository.updateRun(runId, data);

  await this.monthRepository.createMonth(monthData);

});

Repositories may accept TransactionClient if needed.

5. Project Structure

Code should be organized by domain, not by technical layer.

Example

src/

auth/
  auth.controller.ts
  auth.service.ts
  auth.module.ts

budget-simulation/
  dto/
  queries/
  repositories/

  budget-simulation.controller.ts
  budget-simulation.service.ts
  budget-simulation.module.ts

learn/
  dto/
  learn.controller.ts
  learn.service.ts
  learn.module.ts

common/
  utils/
  interceptors/
  guards/

prisma/
  prisma.service.ts

supabase/
  supabase.service.ts

app.module.ts
main.ts

Each domain module owns:

controller

service

queries

repositories

DTOs

6. Dependency Flow

Allowed

Controller → Service
Service → Query
Service → Repository
Query → Prisma
Repository → Prisma

Not allowed

Controller → Query
Controller → Repository
Controller → Prisma
Service → Prisma
Query → Service
Repository → Service

This ensures clean separation of concerns.

7. Error Handling

Services may throw HTTP exceptions when business rules fail.

Examples

BadRequestException

ForbiddenException

NotFoundException

ConflictException

Example

if (!run) {
  throw new NotFoundException('Run not found');
}

Query and Repository layers should not throw HTTP exceptions.

They should return:

entity

null if not found

8. Logging

Unexpected errors should be logged in the service layer.

Example

private readonly logger = new Logger(Service.name);

Logging helps diagnose issues in production.

9. API Responses

APIs should return plain JSON objects.

Example

{
  "monthId": "12",
  "income": 5000
}

Pagination responses may include metadata.

Example

{
  "data": [...],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 50
  }
}
10. Summary

Final architecture flow

Client
   ↓
Controller
   ↓
Service
   ↓
Query / Repository
   ↓
Prisma
   ↓
Database

Responsibilities

Layer	Responsibility
Controller	HTTP handling + validation
Service	Business logic
Query	Database reads
Repository	Database writes
Prisma	ORM
Database	Data storage

This architecture ensures

clear separation of concerns

maintainable code

scalable modules

consistent backend implementation

11. Service Design Rules

The Service layer contains application business logic and orchestrates workflows.

Without clear rules, services tend to grow into large, hard-to-maintain classes.

This section defines guidelines to keep services clean and maintainable.

11.1 Services Should Orchestrate, Not Implement Everything

Services should coordinate operations between:

queries

repositories

domain helpers

Services should not implement large calculation logic directly.

Bad example

async simulateMonth() {
  // 200 lines of calculations here
}

Better

async simulateMonth() {

  const run = await this.runQuery.findRunById(...)

  const result = BudgetCalculator.calculateMonth(run)

  return result

}

Move complex logic to domain helpers.

11.2 Extract Domain Logic

When business logic becomes complex, move it to a domain utility or domain service.

Example

domain/budget-calculator.ts

Example

export class BudgetCalculator {

  static calculateMonth(run: BudgetRun) {

    // complex logic here

  }

}

Benefits

easier testing

smaller services

reusable domain logic

11.3 One Service Method = One Business Use Case

Each service method should represent a single business action.

Examples

Good

startMonth()
simulateMonth()
createRun()
updateIncome()

Bad

processBudgetWorkflow()
handleBudgetOperation()

Service methods should map clearly to business use cases.

11.4 Avoid Large Services

If a service becomes too large, split it.

Example

Bad

budget-simulation.service.ts

1000+ lines.

Better

budget-run.service.ts
budget-month.service.ts
budget-simulation.service.ts

Split by subdomain or workflow.

11.5 Services Must Not Contain Database Queries

Services should call Query or Repository methods.

Bad

await this.prisma.budgetRun.findUnique(...)

Correct

await this.runQuery.findRunWithLatestMonth(...)

Benefits

services stay readable

database logic centralized

easier refactoring

11.6 Services Should Validate Business Rules

Domain constraints must be enforced in services.

Example

if (!run || run.userId !== userId) {
  throw new ForbiddenException('Run not found')
}

Services are responsible for domain validation.

11.7 Use Transactions for Multi-Step Writes

If multiple database writes must succeed together, use transactions.

Example

await this.prisma.$transaction(async (tx) => {

  await this.runRepository.updateRun(tx, runId, data)

  await this.monthRepository.createMonth(tx, monthData)

})

This ensures data consistency.

11.8 Keep Services Readable

Service methods should read like business workflows.

Good example

async startMonth(userId: string, runId: number) {

  const run = await this.runQuery.findRunWithLatestMonth(runId)

  this.validateOwnership(run, userId)

  const simulation = BudgetCalculator.simulateMonth(run)

  await this.monthRepository.createMonth(simulation)

  return simulation

}

Anyone reading this code should understand the business process immediately.

11.9 Extract Reusable Validation Logic

If validation logic repeats, extract helper methods.

Example

private validateOwnership(run: Run, userId: string) {

  if (!run || run.userId !== userId) {
    throw new ForbiddenException('Run not found')
  }

}

Benefits

avoids duplicated checks

cleaner services

11.10 Service Size Guidelines

Services should remain reasonably small.

Recommended guideline

Item	Recommendation
Service class	< 400 lines
Service method	< 80 lines

If exceeded, consider:

extracting domain logic

splitting services

creating helpers

Example Service Structure

Example service

@Injectable()
export class BudgetSimulationService {

  constructor(
    private readonly runQuery: BudgetRunQuery,
    private readonly runRepository: BudgetRunRepository
  ) {}

  async startMonth(userId: string, runId: number) {

    const run = await this.runQuery.findRunWithLatestMonth(runId)

    this.validateOwnership(run, userId)

    const result = BudgetCalculator.simulateMonth(run)

    await this.runRepository.updateRun(run.id, {
      lastSimulatedAt: new Date()
    })

    return result
  }

  private validateOwnership(run: any, userId: string) {

    if (!run || run.userId !== userId) {
      throw new ForbiddenException('Run not found')
    }

  }

}
Summary

Good services should:

orchestrate workflows

enforce business rules

call queries and repositories

remain readable

Avoid:

large services

database queries inside services

complex logic inside service methods

Following these rules keeps services maintainable as the project grows.