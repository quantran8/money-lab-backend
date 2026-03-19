# Skill: Generate Query Layer

Use when creating a database read operation.

## Rules

Queries:

* live in `/queries`
* encapsulate Prisma queries
* define include/select relations
* return explicit types

## Pattern

@Injectable()
export class BudgetRunQuery {

constructor(private readonly prisma: PrismaService) {}

async findRunWithLatestMonth(runId: bigint): Promise<RunWithMonth | null> {

return this.prisma.budgetRun.findUnique({
where: { id: runId },
include: {
months: {
orderBy: { monthIndex: 'desc' },
take: 1
}
}
})

}

}

## Rules

* Queries must not contain business logic
* Queries must define explicit return types
