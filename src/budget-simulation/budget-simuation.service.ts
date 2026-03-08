import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeBillsFinal, deterministicRandom, genAutoSpendLabel } from './budget-simuation.helpers';
import { JarCode } from './budget-simulation.enum';

@Injectable()
export class BudgetSimulationService {
    private readonly logger = new Logger(BudgetSimulationService.name);

    constructor(
        private prisma: PrismaService,
    ) { }

    /** Runs async work and logs unexpected errors (non-HttpException); rethrows. */
    private async wrapAsync<T>(methodName: string, fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            this.logger.error(`${methodName}: ${msg}`, stack);
            throw err;
        }
    }

    // --- Core Public Methods ---

    async getJobs() {
        return this.wrapAsync('getJobs', async () => {
            const jobs = await this.prisma.job.findMany();
            return jobs.map(job => ({
                ...job,
                id: job.id.toString(),
            }));
        });
    }

    async getCommitmentTemplates(moduleId: number, layers: string[]) {
        return this.wrapAsync('getCommitmentTemplates', async () => {
            const templates = await this.prisma.commitmentTemplate.findMany({
                where: {
                    moduleId,
                    layer: { in: layers },
                },
                orderBy: { sortOrder: 'asc' },
            });
            return templates.map(t => ({
                ...t,
                id: t.id.toString(),
            }));
        });
    }

    async getHousingUtilityModifiers() {
        return this.wrapAsync('getHousingUtilityModifiers', async () => {
            const modifiers = await this.prisma.housingUtilityModifier.findMany();
            return modifiers.map(m => ({
                ...m,
                id: m.id.toString(),
                housingCommitmentId: m.housingCommitmentId.toString(),
            }));
        });
    }

    /** Returns active bill reserve options for start-month setup. */
    async getBillReserveOptions() {
        return this.wrapAsync('getBillReserveOptions', async () => {
            const options = await this.prisma.billReserveOption.findMany({
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
            });
            return options.map(o => ({
                code: o.code,
                coveragePct: o.coveragePct,
                label: o.label,
                description: o.description ?? undefined,
                sortOrder: o.sortOrder,
            }));
        });
    }

    /** Returns active spend mode options for start-month setup. */
    async getSpendModeOptions() {
        return this.wrapAsync('getSpendModeOptions', async () => {
            const options = await this.prisma.spendModeOption.findMany({
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
            });
            return options.map(o => ({
                code: o.code,
                rate: Number(o.rate),
                label: o.label,
                description: o.description ?? undefined,
                sortOrder: o.sortOrder,
            }));
        });
    }

    /**
     * Returns all setup options in one call: jobs, commitment templates (optional filter),
     * housing utility modifiers, bill reserve options, spend mode options.
     */
    async getSetupOptions() {
        return this.wrapAsync('getSetupOptions', async () => {
            const moduleId = 3;
            const layerList = ['bills', 'locked', 'food_reserve', 'utilities'];
            const [jobs, commitmentTemplates, housingUtilityModifiers, billReserveOptions, spendModeOptions] =
                await Promise.all([
                    this.getJobs(),
                    moduleId !== undefined && layerList.length > 0
                        ? this.getCommitmentTemplates(moduleId, layerList)
                        : this.prisma.commitmentTemplate.findMany({ orderBy: { sortOrder: 'asc' } }).then(templates =>
                            templates.map(t => ({ ...t, id: t.id.toString() }))
                        ),
                    this.getHousingUtilityModifiers(),
                    this.getBillReserveOptions(),
                    this.getSpendModeOptions(),
                ]);
            return {
                jobs,
                commitmentTemplates,
                housingUtilityModifiers,
                billReserveOptions,
                spendModeOptions,
            };
        });
    }

    async getActiveBudgetRun(userId: string) {
        return this.wrapAsync('getActiveBudgetRun', async () => {
            const run = await this.prisma.budgetRun.findFirst({
                where: { userId },
                orderBy: { startedAt: 'desc' },
                include: {
                    jobState: true,
                    months: {
                        orderBy: { monthIndex: 'desc' },
                        take: 1,
                        include: {
                            allocations: true,
                            spendByJar: true,
                        },
                    },
                    commitments: {
                        include: { template: true }
                    }
                },
            });

            if (!run) return null;

            const billTemplates = await this.prisma.commitmentTemplate.findMany({ where: { layer: "bills" } });
            const housingId = run.commitments.find(c => c.template.category === "housing")?.template.id;
            const housingUtilityModifiers = await this.prisma.housingUtilityModifier.findMany({ where: { housingCommitmentId: housingId } });

            const billEstimatedTemplates = billTemplates.map(t => {
                const modifiers = housingUtilityModifiers.find(m => m.utilityName === t.name);
                const modifierAmount = Number(modifiers?.multiplier ?? 1) * t.baseMonthlyAmount;
                return {
                    templateId: t.id.toString(),
                    name: t.name,
                    layer: t.layer,
                    amount: modifierAmount
                };
            });

            const latestMonth = run.months[0];
            const jarsAllocationArr = latestMonth?.allocations.filter(a => a.jarCode !== 'free_cash') ?? [];
            const spendByJarArr = latestMonth?.spendByJar ?? [];

            const freeCashAlloc = latestMonth?.freeCash ?? 0;
            const freeCashSpend = spendByJarArr.find(s => s.jarCode === 'free_cash');
            const freeCashBalance = freeCashAlloc - (freeCashSpend?.spentAmount ?? 0) + (freeCashSpend?.overflowInAmount ?? 0) - (freeCashSpend?.overflowOutAmount ?? 0);

            // const billReserveTopup = Math.max(0, (latestMonth?.billReserveTarget ?? 0) - (latestMonth?.billReserveStart ?? 0));
            const necessitiesTotal = (latestMonth?.lockedCommitmentsTotal ?? 0) + (latestMonth?.billsEstimated ?? 0) + (latestMonth?.billReserveTarget ?? 0);

            return {
                id: run.id.toString(),
                moduleId: run.moduleId,
                userId: run.userId,
                jobId: run.jobState.jobId.toString(),
                currentMonthIndex: latestMonth?.monthIndex ?? 1,
                isMonthResolved: latestMonth ? latestMonth.billsActual !== null : false,
                freeCash: freeCashBalance,
                income: latestMonth?.income ?? 0,
                necessitiesTotal,
                spendMode: latestMonth?.spendModeCode,
                billReserveOption: latestMonth?.billReserveOptionCode,
                commitments: [...run.commitments.map(c => ({
                    templateId: c.commitmentTemplateId.toString(),
                    name: c.template.name,
                    layer: c.template.layer,
                    amount: c.selectedAmount
                })), ...billEstimatedTemplates],
                jars: jarsAllocationArr.reduce((acc, curr) => {
                    const spent = spendByJarArr.find(s => s.jarCode === curr.jarCode);
                    const spentAmount = spent?.spentAmount ?? 0;
                    const overflowIn = spent?.overflowInAmount ?? 0;
                    const overflowOut = spent?.overflowOutAmount ?? 0;
                    acc[curr.jarCode] = {
                        allocation: curr.amount,
                        balance: curr.amount - spentAmount + overflowIn - overflowOut,
                    };
                    return acc;
                }, {}),
            };
        });
    }

    // --- Converted RPC Methods ---

    async startBudgetRun(
        userId: string,
        moduleId: number,
        jobId: number,
        commitmentAmounts: Record<number, number>
    ) {
        return this.wrapAsync('startBudgetRun', async () => {
            const job = await this.prisma.job.findFirst({
                where: { id: BigInt(jobId) },
                include: {
                    levels: {
                        where: { level: 1 }
                    }
                }
            });
            if (!job) throw new NotFoundException('Job not found');

            const income = job.levels[0]?.incomeBaseOverride ?? job.baseMonthlyIncome;

            let jobState = await this.prisma.userJobState.findFirst({
                where: { userId, jobId: BigInt(jobId) },
                orderBy: { createdAt: 'desc' }
            });

            if (!jobState) {
                jobState = await this.prisma.userJobState.create({
                    data: {
                        userId,
                        jobId: BigInt(jobId),
                        level: 1,
                        xp: 0,
                        currentMonthlyIncome: income,
                        isActive: true
                    }
                });
            } else {
                jobState = await this.prisma.userJobState.update({
                    where: { id: jobState.id },
                    data: {
                        isActive: true,
                        currentMonthlyIncome: jobState.currentMonthlyIncome ?? income,
                        updatedAt: new Date()
                    }
                });
            }

            const run = await this.prisma.budgetRun.create({
                data: {
                    userId,
                    moduleId,
                    jobStateId: jobState.id,
                    totalMonths: 0,
                    finalFutureYouSavings: 0,
                    passed: false
                }
            });

            const commitments = Object.entries(commitmentAmounts).map(([templateId, amount]) => ({
                budgetRunId: run.id,
                commitmentTemplateId: BigInt(templateId),
                selectedAmount: amount,
                effectiveFrom: 1
            }));

            await this.prisma.userRunCommitment.createMany({
                data: commitments
            });

            return {
                runId: run.id.toString(),
                jobStateId: jobState.id.toString()
            };
        });
    }

    async startMonth(
        userId: string,
        runId: number,
        allocations: Record<string, number>,
        billReserveOptionCode: string,
        spendModeCode: string
    ) {
        return this.wrapAsync('startMonth', async () => {
            const run = await this.prisma.budgetRun.findUnique({
                where: { id: BigInt(runId) },
                include: { jobState: { include: { job: true } } }
            });
            if (!run || run.userId !== userId) throw new ForbiddenException('Forbidden or Run not found');

            const covPct = await this.getBillReserveCoveragePct(billReserveOptionCode);

            const prevMonth = await this.prisma.budgetRunMonth.findFirst({
                where: { budgetRunId: BigInt(runId) },
                orderBy: { monthIndex: 'desc' }
            });

            const monthIndex = (prevMonth?.monthIndex ?? 0) + 1;
            const hiStart = prevMonth?.healthIndexEnd ?? 70;
            const lqiStart = prevMonth?.lqiEnd ?? 40;
            const stress = prevMonth?.structuralOvercommitmentOccurred ?? false;
            const billReserveStart = prevMonth?.billReserveEnd ?? 0;

            const commitments = await this.prisma.userRunCommitment.findMany({
                where: { budgetRunId: BigInt(runId) },
                include: { template: true }
            });

            const lockedTotal = commitments
                .filter(c => c.template.layer === 'locked')
                .reduce((sum, c) => sum + c.selectedAmount, 0);

            const foodReserve = commitments
                .filter(c => c.template.category === 'food')
                .reduce((sum, c) => sum + c.selectedAmount, 0);

            const housingUtilityModifiers = await this.prisma.housingUtilityModifier.findMany({
                where: { housingCommitmentId: { in: commitments.filter(c => c.template.category === 'housing').map(c => c.commitmentTemplateId) } }
            });

            const billTemplates = await this.prisma.commitmentTemplate.findMany({
                where: { moduleId: 3, layer: 'bills' }
            });


            const billsEstimated = billTemplates.reduce((sum, t) => {
                const modifier = housingUtilityModifiers.find(m => m.utilityName.toLowerCase() === t.name.toLowerCase());
                return sum + t.baseMonthlyAmount * (Number(modifier?.multiplier) ?? 1);
            }, 0);

            const income = Number(run.jobState.currentMonthlyIncome);

            const billReserveTarget = Math.round((covPct / 100) * billsEstimated);
            const topupNeeded = Math.max(0, billReserveTarget - billReserveStart);
            const billReserveEnd = billReserveStart + topupNeeded;

            const necTotal = lockedTotal + foodReserve + billsEstimated + topupNeeded;
            const leftToAllocate = income - necTotal;

            if (leftToAllocate < 0) throw new BadRequestException('Guardrail failed: left_to_allocate < 0');

            const allocSum = Object.values(allocations).reduce((sum, val) => sum + val, 0);
            if (allocSum > leftToAllocate) throw new BadRequestException('Overspending: allocations > left_to_allocate');

            const monthFreeCash = leftToAllocate - allocSum;

            // Cumulative free cash (remaining from last month + this month's new free cash)
            let prevMonthFreeCashBalance = 0;
            if (prevMonth) {
                const prevSpend = await this.prisma.budgetMonthSpendByJar.findUnique({
                    where: { budgetMonthId_jarCode: { budgetMonthId: prevMonth.id, jarCode: 'free_cash' } }
                });
                prevMonthFreeCashBalance = prevMonth.freeCash - (prevSpend?.spentAmount ?? 0) + (prevSpend?.overflowInAmount ?? 0) - (prevSpend?.overflowOutAmount ?? 0);
            }
            const cumulativeFreeCash = Math.max(0, prevMonthFreeCashBalance + monthFreeCash);

            const month = await this.prisma.budgetRunMonth.create({
                data: {
                    budgetRunId: BigInt(runId),
                    monthIndex,
                    income,
                    lockedCommitmentsTotal: lockedTotal,
                    billsEstimated,
                    billsActual: 0,
                    billReserveOptionCode,
                    billReserveTarget,
                    billReserveStart,
                    billReserveEnd,
                    spendModeCode,
                    healthIndexStart: hiStart,
                    healthIndexEnd: hiStart,
                    lqiStart: lqiStart,
                    lqiEnd: lqiStart,
                    cumulativeFutureYou: prevMonth?.cumulativeFutureYou ?? 0,
                    freeCash: cumulativeFreeCash,
                    currentWeek: 0,
                    stressModeActive: stress,
                    overtimeUnits: 0,
                    overtimeIncome: 0,
                    overtimeHealthCost: 0,
                }
            });

            await this.upsertMonthAllocations(month.id, allocations);

            return {
                monthId: month.id.toString(),
                monthIndex: monthIndex,
                income,
                lockedTotal: lockedTotal,
                foodReserve: foodReserve,
                billsEstimated: billsEstimated,
                billReserve: {
                    option: billReserveOptionCode,
                    target: billReserveTarget,
                    start: billReserveStart,
                    topupNeeded: topupNeeded,
                    end: billReserveEnd
                },
                necTotal: necTotal,
                leftToAllocate: leftToAllocate,
                allocatedTotal: allocSum,
                freeCash: cumulativeFreeCash,
                spendModeCode: spendModeCode,
                stressModeActive: stress,
                hiStart: hiStart,
                lqiStart: lqiStart
            };
        });
    }

    async resolveWeek(userId: string, monthId: number) {
        return this.wrapAsync('resolveWeek', async () => {
            const monthIdBig = BigInt(monthId);
            const month = await this.prisma.budgetRunMonth.findUnique({
                where: { id: monthIdBig },
                include: { budgetRun: true }
            });

            if (!month || month.budgetRun.userId !== userId) throw new ForbiddenException('Forbidden or Month not found');
            if (month.currentWeek >= 5) throw new BadRequestException('Month already complete');

            if (month.currentWeek >= 1) {
                const pending = await this.prisma.budgetMonthEvent.findFirst({
                    where: { budgetMonthId: monthIdBig, week: month.currentWeek, chosenOptionId: null }
                });
                if (pending) throw new BadRequestException('Previous week event unresolved');
            }

            const nextWeek = month.currentWeek + 1;
            await this.prisma.budgetRunMonth.update({
                where: { id: monthIdBig },
                data: { currentWeek: nextWeek }
            });

            const spendResult = await this.spendJarsForWeek(monthIdBig);
            const entries = spendResult.entries;

            const eventPending = await this.spawnEventForWeek(monthIdBig, nextWeek);

            let bills: any = null;
            let monthComplete = false;
            let futureTotal = month.cumulativeFutureYou;
            let freeCashBalance = month.freeCash;
            let spendingSummary: Record<string, number> = {};
            let futureRemainInMonth = 0

            if (nextWeek === 4 && !eventPending) {
                const billResult = await this.finalizeBills(Number(month.budgetRunId), month.monthIndex, month.billsEstimated);
                await this.finalizeBillsForMonth(userId, Number(monthId), billResult.actual);

                const futureYouAllocation = await this.prisma.budgetMonthAllocation.findFirst({ where: { budgetMonthId: monthIdBig, jarCode: JarCode.futureYou } })
                const futureYouSpending = await this.prisma.budgetMonthSpendByJar.findFirst({ where: { budgetMonthId: monthIdBig, jarCode: JarCode.futureYou } })

                if (futureYouAllocation) {
                    futureRemainInMonth = futureYouAllocation.amount - (futureYouSpending?.spentAmount ?? 0)
                }

                await this.prisma.budgetRunMonth.update({
                    where: { id: monthIdBig },
                    data: {
                        currentWeek: 5,
                        healthIndexEnd: month.healthIndexEnd,
                        lqiEnd: month.lqiEnd,
                        cumulativeFutureYou: { increment: futureRemainInMonth }
                    }
                });
                monthComplete = true;

                const updatedMonth = await this.prisma.budgetRunMonth.findUnique({
                    where: { id: monthIdBig },
                    include: { spendByJar: true }
                });
                futureTotal = updatedMonth?.cumulativeFutureYou ?? futureTotal;
                bills = billResult;
                freeCashBalance = updatedMonth?.freeCash ?? freeCashBalance;

                if (updatedMonth) {
                    spendingSummary = updatedMonth.spendByJar.reduce((acc, s) => {
                        acc[s.jarCode] = s.spentAmount;
                        return acc;
                    }, {});
                }
            }

            return {
                week: nextWeek,
                entries,
                hiAfter: month.healthIndexEnd,
                lqiAfter: month.lqiEnd,
                systemNotice: null,
                eventPending: eventPending,
                monthComplete: monthComplete,
                bills,
                futureYouTotal: futureTotal,
                freeCashBalance: freeCashBalance,
                spendingSummary: spendingSummary
            };
        });
    }

    /** Valid jar codes for event payment (primary + cover). */
    private static readonly VALID_JAR_CODES = new Set(['free_cash', 'fun', 'learning', 'give', 'future_you']);

    /**
     * Applies the chosen event option: updates HI/LQI and, if option has a cost, deducts from
     * payment jar first then from cover jars in order (manual cover split). No negative balances.
     */
    async applyEventChoice(
        userId: string,
        monthId: number,
        week: number,
        optionId: number,
        paymentJarCode: string,
        coverJarCodes: string[] = []
    ) {
        return this.wrapAsync('applyEventChoice', async () => {
            const monthIdBig = BigInt(monthId);
            const month = await this.prisma.budgetRunMonth.findUnique({
                where: { id: monthIdBig },
                include: { budgetRun: true }
            });

            if (!month || month.budgetRun.userId !== userId) {
                throw new ForbiddenException('Forbidden or Month not found');
            }

            const event = await this.prisma.budgetMonthEvent.findFirst({
                where: { budgetMonthId: monthIdBig, week, chosenOptionId: null }
            });
            if (!event) throw new BadRequestException('No pending event for this week');

            const option = await this.prisma.lifeEventOption.findUnique({ where: { id: BigInt(optionId) } });
            if (!option || option.eventTemplateId !== event.eventTemplateId) {
                throw new BadRequestException('Invalid option');
            }

            if (!BudgetSimulationService.VALID_JAR_CODES.has(paymentJarCode)) {
                throw new BadRequestException(`Invalid payment jar: ${paymentJarCode}`);
            }
            for (const code of coverJarCodes) {
                if (!BudgetSimulationService.VALID_JAR_CODES.has(code)) {
                    throw new BadRequestException(`Invalid cover jar: ${code}`);
                }
            }
            if (coverJarCodes.includes(paymentJarCode)) {
                throw new BadRequestException('Cover jars must not duplicate the payment jar');
            }

            let hi = month.healthIndexEnd ?? 0;
            let lqi = month.lqiEnd ?? 0;
            hi = Math.max(0, Math.min(100, hi + (option.healthDelta ?? 0)));
            lqi = Math.max(0, Math.min(100, lqi + (option.lqiDelta ?? 0)));

            await this.prisma.budgetRunMonth.update({
                where: { id: monthIdBig },
                data: { healthIndexEnd: hi, lqiEnd: lqi }
            });

            const moneyDelta = option.moneyDelta ?? 0;
            const cost = moneyDelta < 0 ? Math.abs(moneyDelta) : 0;
            const paymentRecord: { jar: string; amount: number }[] = [];

            if (cost > 0) {
                const primaryAvailable = await this.getJarAvailable(monthIdBig, paymentJarCode);
                if (primaryAvailable >= cost) {
                    paymentRecord.push({ jar: paymentJarCode, amount: cost });
                } else {
                    const firstDeduct = primaryAvailable;
                    let remaining = cost - firstDeduct;
                    paymentRecord.push({ jar: paymentJarCode, amount: firstDeduct });
                    for (const coverJar of coverJarCodes) {
                        if (remaining <= 0) break;
                        const coverAvailable = await this.getJarAvailable(monthIdBig, coverJar);
                        const deduct = Math.min(coverAvailable, remaining);
                        if (deduct > 0) {
                            paymentRecord.push({ jar: coverJar, amount: deduct });
                            remaining -= deduct;
                        }
                    }
                    if (remaining > 0) {
                        throw new BadRequestException('Not enough funds to cover this option.');
                    }
                }
                for (const { jar, amount } of paymentRecord) {
                    if (jar === 'free_cash') {
                        await this.prisma.budgetRunMonth.update({
                            where: { id: monthIdBig },
                            data: { freeCash: { decrement: amount } }
                        });
                        continue;
                    }
                    await this.addSpendLog(monthIdBig, jar, amount, 0, 0);
                }
            } else if (moneyDelta > 0) {
                const jar = option.moneyJarCode ?? 'free_cash';
                if (jar === 'free_cash') {
                    await this.prisma.budgetRunMonth.update({
                        where: { id: monthIdBig },
                        data: { freeCash: { increment: moneyDelta } }
                    });
                } else {
                    await this.addSpendLog(monthIdBig, jar, 0, moneyDelta, 0);
                }
            }

            const paymentBreakdown =
                paymentRecord.length > 0
                    ? (paymentRecord.map(({ jar, amount }) => ({ jarCode: jar, amount })) as { jarCode: string; amount: number }[])
                    : {};

            await this.prisma.budgetMonthEvent.update({
                where: { id: event.id },
                data: { chosenOptionId: BigInt(optionId), paymentBreakdown }
            });

            let bills: any = null;
            let monthComplete = false;
            let futureTotal = 0;
            let spendSummary: Record<string, number> = {};
            let futureRemainInMonth = 0;

            const futureYouAllocation = await this.prisma.budgetMonthAllocation.findFirst({ where: { budgetMonthId: monthIdBig, jarCode: JarCode.futureYou } })
            const futureYouSpending = await this.prisma.budgetMonthSpendByJar.findFirst({ where: { budgetMonthId: monthIdBig, jarCode: JarCode.futureYou } })

            if (futureYouAllocation) {
                futureRemainInMonth = futureYouAllocation.amount - (futureYouSpending?.spentAmount ?? 0)
            }

            if (week === 4) {
                const billResult = await this.finalizeBills(Number(month.budgetRunId), month.monthIndex, month.billsEstimated);
                await this.finalizeBillsForMonth(userId, Number(monthId), billResult.actual);

                await this.prisma.budgetRunMonth.update({
                    where: { id: monthIdBig },
                    data: { currentWeek: 5, cumulativeFutureYou: { increment: futureRemainInMonth } }
                });
                monthComplete = true;



                const updatedMonth = await this.prisma.budgetRunMonth.findUnique({ where: { id: monthIdBig }, include: { spendByJar: true } });
                futureTotal = (updatedMonth?.cumulativeFutureYou ?? 0);
                bills = billResult;
                if (updatedMonth) {
                    spendSummary = updatedMonth.spendByJar.reduce((acc, s) => {
                        acc[s.jarCode] = s.spentAmount;
                        return acc;
                    }, {});
                }
            }

            return {
                optionId: optionId,
                optionLabel: option.optionLabel,
                healthDelta: option.healthDelta,
                lqiDelta: option.lqiDelta,
                moneyDelta: option.moneyDelta,
                defaultJarCode: option.moneyJarCode ?? undefined,
                paymentRecord: paymentRecord,
                hiAfter: hi,
                lqiAfter: lqi,
                monthComplete: monthComplete,
                bills,
                futureYouTotal: futureTotal,
                futureRemainInMonth,
                spendingSummary: spendSummary
            };
        });
    }

    // --- Helper Methods ---

    private async getBillReserveCoveragePct(code: string): Promise<number> {
        const option = await this.prisma.billReserveOption.findUnique({
            where: { code, isActive: true }
        });
        if (!option) throw new BadRequestException(`Invalid bill_reserve_option_code: ${code}`);
        return option.coveragePct;
    }

    private async getSpendModeRate(code: string): Promise<number> {
        const option = await this.prisma.spendModeOption.findUnique({
            where: { code, isActive: true }
        });
        if (!option) throw new BadRequestException(`Invalid spend_mode_code: ${code}`);
        return Number(option.rate);
    }

    private async upsertMonthAllocations(monthId: bigint, allocations: Record<string, number>) {
        const coreJars = ['fun', 'learning', 'give', 'future_you'];

        for (const [jarCode, amount] of Object.entries(allocations)) {
            if (jarCode === 'free_cash') continue;
            await this.prisma.budgetMonthAllocation.upsert({
                where: { budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode } },
                update: { amount },
                create: { budgetMonthId: monthId, jarCode, amount }
            });
        }

        for (const jarCode of coreJars) {
            await this.prisma.budgetMonthAllocation.upsert({
                where: { budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode } },
                update: {},
                create: { budgetMonthId: monthId, jarCode, amount: 0 }
            });
        }
    }

    /** Returns available balance for a jar (allocation - spent + overflowIn - overflowOut). */
    private async getJarAvailable(monthId: bigint, jarCode: string): Promise<number> {
        let allocationAmount = 0;
        if (jarCode === 'free_cash') {
            const month = await this.prisma.budgetRunMonth.findUnique({ where: { id: monthId } });
            allocationAmount = Number(month?.freeCash ?? 0);
        } else {
            const allocation = await this.prisma.budgetMonthAllocation.findUnique({
                where: { budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode } }
            });
            allocationAmount = allocation?.amount ?? 0;
        }

        const spendByJar = await this.prisma.budgetMonthSpendByJar.findUnique({
            where: { budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode } }
        });
        const spent = spendByJar?.spentAmount ?? 0;
        const overflowIn = spendByJar?.overflowInAmount ?? 0;
        const overflowOut = spendByJar?.overflowOutAmount ?? 0;
        return Math.max(0, allocationAmount - spent + overflowIn - overflowOut);
    }

    /**
     * Deducts up to `amount` from jar; does not modify budgetMonthAllocation.amount (initial budget).
     * Spending is recorded via addSpendLog. Available = allocation - spent + overflowIn - overflowOut.
     */
    private async deductFromJar(monthId: bigint, jarCode: string, amount: number) {
        let allocationAmount = 0;
        if (jarCode === 'free_cash') {
            const month = await this.prisma.budgetRunMonth.findUnique({ where: { id: monthId } });
            allocationAmount = Number(month?.freeCash ?? 0);
        } else {
            const allocation = await this.prisma.budgetMonthAllocation.findUnique({
                where: { budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode } }
            });
            allocationAmount = allocation?.amount ?? 0;
        }

        const spendByJar = await this.prisma.budgetMonthSpendByJar.findUnique({
            where: { budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode } }
        });
        const spentSoFar = spendByJar?.spentAmount ?? 0;
        const overflowIn = spendByJar?.overflowInAmount ?? 0;
        const overflowOut = spendByJar?.overflowOutAmount ?? 0;
        const available = allocationAmount - spentSoFar + overflowIn - overflowOut;
        const spent = Math.min(Math.max(0, available), amount);
        const jarBalance = available - spent;

        return { spent, jarBalance };
    }

    private async addSpendLog(monthId: bigint, jarCode: string, spent: number, overflowIn: number, overflowOut: number) {
        await this.prisma.budgetMonthSpendByJar.upsert({
            where: { budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode } },
            update: {
                spentAmount: { increment: spent },
                overflowInAmount: { increment: overflowIn },
                overflowOutAmount: { increment: overflowOut }
            },
            create: {
                budgetMonthId: monthId,
                jarCode,
                spentAmount: spent,
                overflowInAmount: overflowIn,
                overflowOutAmount: overflowOut
            }
        });
    }

    private async spendJarsForWeek(monthId: bigint) {
        const month = await this.prisma.budgetRunMonth.findUnique({ where: { id: monthId } });
        if (!month) throw new NotFoundException('Month not found');
        const spendModeCode = month.spendModeCode ?? 'NORMAL';
        const rate = await this.getSpendModeRate(spendModeCode);

        // Core jars to apply automatic weekly spending
        const coreJars = [JarCode.fun, JarCode.learning, JarCode.give];
        const allocations = await this.prisma.budgetMonthAllocation.findMany({
            where: {
                budgetMonthId: monthId,
                jarCode: { in: coreJars }
            }
        });

        const entries: any[] = [];

        for (const jarEntry of allocations) {
            const jar = jarEntry.jarCode;
            // Calculate max monthly spend available based on allocation and spend mode rate
            const maxMonthAvailable = Math.round(jarEntry.amount * rate);
            // Calculate exact weekly amount, ensuring total for 4 weeks never exceed maxMonthAvailable
            const weeklyAmount = Math.floor(maxMonthAvailable / 4.0);

            if (weeklyAmount <= 0) continue;

            const { spent, jarBalance } = await this.deductFromJar(monthId, jar, weeklyAmount);
            if (spent > 0) {
                await this.addSpendLog(monthId, jar, spent, 0, 0);
                const weekGlobal = (month.monthIndex - 1) * 4 + month.currentWeek;
                const label = genAutoSpendLabel(
                    `${month.budgetRunId}:${monthId}:${jar}`,
                    jar,
                    spent,
                    spendModeCode,
                    weekGlobal
                );
                entries.push({
                    type: 'auto_spend',
                    jar,
                    amount: spent,
                    jarBalance,
                    label
                });
            }
        }
        return { entries };
    }

    private async spawnEventForWeek(monthId: bigint, week: number) {
        const month = await this.prisma.budgetRunMonth.findUnique({
            where: { id: monthId },
            include: { budgetRun: { include: { module: true } } }
        });
        if (!month) return null;

        // 0) Idempotent
        const existing = await this.prisma.budgetMonthEvent.findFirst({
            where: { budgetMonthId: monthId, week, chosenOptionId: null },
            include: { template: { include: { options: { orderBy: { sortOrder: 'asc' } } } } }
        });

        if (existing) {
            return {
                templateId: existing.template.id.toString(),
                title: existing.template.title,
                description: existing.template.description,
                options: existing.template.options.map((o) => ({
                    optionId: o.id.toString(),
                    optionLabel: o.optionLabel,
                    description: o.description,
                    defaultJarCode: o.moneyJarCode,
                    moneyDelta: o.moneyDelta,
                    healthDelta: o.healthDelta,
                    lqiDelta: o.lqiDelta,
                    learningXpDelta: o.learningXpDelta,
                })),
            };
        }

        // 1) Spawn roll
        const seed = `${month.budgetRunId}:${month.monthIndex}:${week}:spawn`;
        if (deterministicRandom(seed) >= 0.5) return null;

        // 2) Used templates last 6 months
        const usedEvents = await this.prisma.budgetMonthEvent.findMany({
            where: {
                month: {
                    budgetRunId: month.budgetRunId,
                    monthIndex: {
                        gte: Math.max(1, month.monthIndex - 5),
                        lte: month.monthIndex
                    }
                }
            },
            select: { eventTemplateId: true }
        });
        const usedIds = usedEvents.map(e => e.eventTemplateId);

        // 3) Weighted pick
        const templates = await this.prisma.lifeEventTemplate.findMany({
            where: {
                moduleId: month.budgetRun.moduleId,
                id: { notIn: usedIds }
            }
        });

        if (templates.length === 0) return null;

        const totalWeight = templates.reduce((sum, t) => sum + (11 - t.rarity), 0);
        const roll = deterministicRandom(`${month.budgetRunId}:${month.monthIndex}:${week}:template`) * totalWeight;

        let runningWeight = 0;
        let selectedTemplate = templates[0];
        for (const t of templates) {
            runningWeight += (11 - t.rarity);
            if (runningWeight >= roll) {
                selectedTemplate = t;
                break;
            }
        }

        // 4) Insert
        const event = await this.prisma.budgetMonthEvent.create({
            data: {
                budgetMonthId: monthId,
                eventTemplateId: selectedTemplate.id,
                week
            },
            include: { template: { include: { options: { orderBy: { sortOrder: 'asc' } } } } }
        });

        return {
            templateId: event.template.id.toString(),
            title: event.template.title,
            description: event.template.description,
            options: event.template.options.map(o => ({
                optionId: o.id.toString(),
                optionLabel: o.optionLabel,
                description: o.description,
                defaultJarCode: o.moneyJarCode,
                moneyDelta: o.moneyDelta,
                healthDelta: o.healthDelta,
                lqiDelta: o.lqiDelta,
                learningXpDelta: o.learningXpDelta
            }))
        };
    }

    private async finalizeBills(runId: number, monthIndex: number, estimated: number) {
        return computeBillsFinal(runId, monthIndex, estimated);
    }

    private async finalizeBillsForMonth(userId: string, monthId: number, actual: number) {
        const monthIdBig = BigInt(monthId);
        const month = await this.prisma.budgetRunMonth.findUnique({
            where: { id: monthIdBig },
            include: { budgetRun: true }
        });

        if (!month || month.budgetRun.userId !== userId) throw new ForbiddenException('Forbidden');
        if (month.currentWeek < 4) throw new BadRequestException('Cannot finalize bills before week 4');
        if (month.billsActual !== 0 && month.billsActual !== null && month.billsActual !== month.billsEstimated) {
            // Idempotency check if needed, but here 0 is initial
        }

        const delta = actual - month.billsEstimated;
        let breakdown: any = {};

        if (delta <= 0) {
            const surplus = Math.abs(delta);
            breakdown = { billsDelta: delta, surplusToFreeCash: surplus };
            await this.prisma.budgetRunMonth.update({
                where: { id: monthIdBig },
                data: {
                    billsActual: actual,
                    billReconcileBreakdown: breakdown,
                    freeCash: { increment: surplus }
                }
            });
        } else {
            let rem = delta;

            // 1) Bill reserve
            const takenReserve = Math.min(month.billReserveEnd, rem);
            rem -= takenReserve;
            breakdown.billReserve = takenReserve;
            await this.prisma.budgetRunMonth.update({
                where: { id: monthIdBig },
                data: { billReserveEnd: month.billReserveEnd - takenReserve }
            });

            // 2-6) Jars in order
            const jarOrder = ['fun', 'give', 'learning', 'free_cash', 'future_you'];
            let freeCashDeficit = 0;
            for (const jar of jarOrder) {
                if (rem <= 0) break;
                const { spent } = await this.deductFromJar(monthIdBig, jar, rem);
                if (spent > 0) {
                    if (jar === 'free_cash') {
                        freeCashDeficit = spent;
                    } else {
                        await this.addSpendLog(monthIdBig, jar, 0, 0, spent);
                    }
                    rem -= spent;
                    breakdown[jar] = spent;
                }
            }

            await this.prisma.budgetRunMonth.update({
                where: { id: monthIdBig },
                data: {
                    billsActual: actual,
                    billReconcileBreakdown: { ...breakdown, billsDelta: delta, uncovered: rem },
                    structuralOvercommitmentOccurred: rem > 0,
                    freeCash: { decrement: freeCashDeficit }
                }
            });
        }

        return breakdown;
    }
}
