This project follows a strict layered architecture.

Controller
→ Service
→ Domain Helpers
→ Query / Repository
→ Prisma
→ Database

The AI must enforce this architecture.

---

# Controller Layer

Controllers handle HTTP only.

Allowed:
- routes
- DTO validation
- calling services

Forbidden:
- business logic
- Prisma usage
- repository usage
- query construction

---

# Service Layer

Services implement business workflows.

Services must:
- orchestrate queries and repositories
- validate business rules
- call domain helpers
- manage transactions

Services must NOT:
- inject or call `PrismaService`
- construct database queries
- contain large algorithms

**Multi-write transactions:** use a persistence-layer **transaction runner** (e.g. `TransactionRunner`) that wraps `prisma.$transaction`. Services call `runner.run((tx) => …)` and pass `tx` into repositories—do not inject `PrismaService` in workflow services.

---

# Domain Helpers

Domain helpers contain pure business logic.

They must not:
- depend on NestJS
- access Prisma
- call repositories
- throw HTTP exceptions

---

# Query Layer

Queries perform database reads.

Rules:

- Encapsulate Prisma queries
- Define include/select relations
- Return explicit types
- Hide Prisma implementation

Services must call queries instead of Prisma.

---

# Repository Layer

Repositories perform database writes.

Rules:

- Encapsulate Prisma mutations
- No business logic
- No HTTP exceptions

**Transaction runner:** small class that only executes `prisma.$transaction` and lives next to repositories (same persistence boundary).

---

# Dependency Flow

Allowed:

Controller → Service  
Service → Domain  
Service → Query  
Service → Repository  
Service → Transaction runner (persistence; interactive writes only)  
Query → Prisma  
Repository → Prisma  
Transaction runner → Prisma  

Forbidden:

Controller → Prisma  
Controller → Repository  
Service → PrismaService  
Query → Service  
Repository → Service  
Domain → Prisma