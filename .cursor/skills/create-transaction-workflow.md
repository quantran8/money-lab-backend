# Skill: Create Transaction Workflow

Use when implementing multi-step database writes.

## Correct Pattern

1. Load data
2. Compute business logic
3. Execute transaction with writes only

## Example

async startMonth(userId: string, runId: number) {

const run = await this.runQuery.findRunWithLatestMonth(runId)

this.validateOwnership(run, userId)

const simulation = BudgetCalculator.simulateMonth(run)

await this.prisma.$transaction(async (tx) => {

await this.monthRepository.createMonth(tx, simulation)

await this.runRepository.updateRun(tx, runId, {
lastSimulatedAt: new Date()
})

})

return simulation

}

## Rules

Transactions should contain writes only.

Avoid:

transaction
read
write
read
write
