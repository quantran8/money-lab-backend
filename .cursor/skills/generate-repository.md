# Skill: Generate Repository Layer

Repositories handle database writes.

## Rules

Repositories:

* live in `/repositories`
* encapsulate Prisma mutations
* contain no business logic
* do not throw HTTP exceptions

## Example

@Injectable()
export class BudgetRunRepository {

constructor(private readonly prisma: PrismaService) {}

async updateRun(
id: bigint,
data: Prisma.BudgetRunUpdateInput
) {

return this.prisma.budgetRun.update({
where: { id },
data
})

}

}

## Transaction Support

Repositories may accept `TransactionClient`.

Example:

async updateRun(
tx: Prisma.TransactionClient,
id: bigint,
data: Prisma.BudgetRunUpdateInput
)
