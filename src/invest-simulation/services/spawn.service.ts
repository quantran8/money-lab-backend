import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestArcQuery } from '../queries/arc.query.js';
import { InvestArcRepository } from '../repositories/arc.repository.js';
import { InvestSpotlightQuery } from '../queries/spotlight.query.js';
import { InvestSpotlightRepository } from '../repositories/spotlight.repository.js';
import { InvestPolicyQuery } from '../queries/policy.query.js';
import { InvestPolicyRepository } from '../repositories/policy.repository.js';
import {
  shouldSpawnSpotlightFromArc,
  selectSpotlightAssets,
  selectSpotlightTemplate,
  filterArcCandidatesByCooldown,
  selectArcType,
  selectPolicyTemplate,
  spotlightPriceMultiplier,
  type ArcTransitionEvent,
  type SpotlightTransitionEvent,
  type SpotlightAssetCandidate,
  type SpotlightTemplateCandidate,
  type ArcSpawnCandidate,
  type PolicySpawnCandidate,
} from '../domain/index.js';
import type { ArcInstanceWithTypeRow } from '../types/index.js';
import type { PolicyTransitionEvent } from './policy.service.js';
import {
  MAX_ACTIVE_ARCS,
  MAX_ACTIVE_POLICIES,
  ARC_COOLDOWN_TICKS,
  POLICY_COOLDOWN_TICKS,
  MAX_SPOTLIGHTS_PER_ARC_TRANSITION,
} from '../invest-simulation.constant.js';

export interface SpawnResult {
  spawnedSpotlightEvents: SpotlightTransitionEvent[];
  spawnedArcEvents: ArcTransitionEvent[];
  spawnedPolicyEvents: PolicyTransitionEvent[];
  spawnedSpotlightImpacts: Record<string, number>;
}

@Injectable()
export class InvestSpawnService {
  private readonly logger = new Logger(InvestSpawnService.name);

  constructor(
    private readonly arcQuery: InvestArcQuery,
    private readonly arcRepo: InvestArcRepository,
    private readonly spotlightQuery: InvestSpotlightQuery,
    private readonly spotlightRepo: InvestSpotlightRepository,
    private readonly policyQuery: InvestPolicyQuery,
    private readonly policyRepo: InvestPolicyRepository,
  ) {}

  /**
   * Run all spawn checks for the current tick.
   * Called after state machines advance, before news generation.
   */
  async spawnForTick(
    tickIndex: bigint,
    arcEvents: ArcTransitionEvent[],
    arcActiveInstances: ArcInstanceWithTypeRow[],
    arcRemainingCount: number,
    policyRemainingCount: number,
    tx: TxClient,
  ): Promise<SpawnResult> {
    const spawnedSpotlightEvents: SpotlightTransitionEvent[] = [];
    const spawnedArcEvents: ArcTransitionEvent[] = [];
    const spawnedPolicyEvents: PolicyTransitionEvent[] = [];
    const spawnedSpotlightImpacts: Record<string, number> = {};

    // 1. Arc-driven spotlight spawning
    await this.spawnSpotlightsFromArcs(
      tickIndex,
      arcEvents,
      arcActiveInstances,
      spawnedSpotlightEvents,
      spawnedSpotlightImpacts,
      tx,
    );

    // 2. Arc respawn if below max
    await this.spawnArcsIfNeeded(
      tickIndex,
      arcRemainingCount,
      spawnedArcEvents,
      tx,
    );

    // 3. Policy respawn if below max
    await this.spawnPoliciesIfNeeded(
      tickIndex,
      policyRemainingCount,
      arcActiveInstances,
      spawnedPolicyEvents,
      tx,
    );

    if (
      spawnedSpotlightEvents.length > 0 ||
      spawnedArcEvents.length > 0 ||
      spawnedPolicyEvents.length > 0
    ) {
      this.logger.log(
        `Spawned: ${spawnedSpotlightEvents.length} spotlights, ` +
          `${spawnedArcEvents.length} arcs, ` +
          `${spawnedPolicyEvents.length} policies`,
      );
    }

    return {
      spawnedSpotlightEvents,
      spawnedArcEvents,
      spawnedPolicyEvents,
      spawnedSpotlightImpacts,
    };
  }

  // ── Arc-driven Spotlight Spawn ──────────────────────────────────

  private async spawnSpotlightsFromArcs(
    tickIndex: bigint,
    arcEvents: ArcTransitionEvent[],
    arcActiveInstances: ArcInstanceWithTypeRow[],
    outEvents: SpotlightTransitionEvent[],
    outImpacts: Record<string, number>,
    tx: TxClient,
  ): Promise<void> {
    // Find arc transitions that trigger spotlight spawning
    const triggeringEvents = arcEvents.filter((e) =>
      shouldSpawnSpotlightFromArc(e.toState),
    );
    if (triggeringEvents.length === 0) return;

    for (let i = 0; i < triggeringEvents.length; i++) {
      const event = triggeringEvents[i];
      const arcInstance = arcActiveInstances.find(
        (inst) => inst.arcType.name === event.arcTypeName,
      );
      if (!arcInstance) continue;

      const arcTypeId = arcInstance.arcTypeId;
      const seed = `spawn:spotlight:${tickIndex}:${i}`;

      // Load arc-specific mappings
      const [arcTemplates, arcAffinities] = await Promise.all([
        this.arcQuery.findArcSpotlightTemplates(arcTypeId),
        this.arcQuery.findArcAssetAffinities(arcTypeId),
      ]);

      if (arcTemplates.length === 0 || arcAffinities.length === 0) continue;

      // Filter to eligible assets (no active spotlight, past cooldown)
      const affinityAssetIds = arcAffinities.map((a) => a.assetId);
      const eligibleAssets = await this.spotlightQuery.findEligibleAssets(
        tickIndex,
        affinityAssetIds,
      );
      if (eligibleAssets.length === 0) continue;

      // Build candidates with affinity
      const affinityMap = new Map(
        arcAffinities.map((a) => [a.assetId.toString(), Number(a.affinity)]),
      );
      const assetCandidates: SpotlightAssetCandidate[] = eligibleAssets.map(
        (a) => ({
          assetId: a.id,
          affinity: affinityMap.get(a.id.toString()) ?? 0,
        }),
      );

      // Select assets weighted by affinity
      const selectedAssetIds = selectSpotlightAssets(
        assetCandidates,
        MAX_SPOTLIGHTS_PER_ARC_TRANSITION,
        seed,
      );

      // Select template weighted by mapping weight
      const templateCandidates: SpotlightTemplateCandidate[] = arcTemplates.map(
        (t) => ({
          templateId: t.templateId,
          weight: Number(t.weight),
        }),
      );

      for (let j = 0; j < selectedAssetIds.length; j++) {
        const assetId = selectedAssetIds[j];
        const templateId = selectSpotlightTemplate(
          templateCandidates,
          `${seed}:tmpl:${j}`,
        );
        if (!templateId) continue;

        await this.spotlightRepo.createInstance(
          {
            templateId,
            assetId,
            state: 'emerging',
            ticksInCurrentState: 0,
            startedAtTick: tickIndex,
            isActive: true,
          },
          tx,
        );

        // Find asset info for event
        const assetInfo = eligibleAssets.find((a) => a.id === assetId);
        outEvents.push({
          type: 'spotlight',
          assetId,
          assetName: `Asset#${assetId}`,
          sectorCode: `sector:${assetInfo?.sectorId ?? 0}`,
          fromState: 'dormant',
          toState: 'emerging',
        });

        // Emerging state price impact
        const impact = spotlightPriceMultiplier('emerging');
        const key = assetId.toString();
        outImpacts[key] = (outImpacts[key] ?? 0) + impact;
      }
    }
  }

  // ── Arc Respawn ─────────────────────────────────────────────────

  private async spawnArcsIfNeeded(
    tickIndex: bigint,
    remainingActiveCount: number,
    outEvents: ArcTransitionEvent[],
    tx: TxClient,
  ): Promise<void> {
    if (remainingActiveCount >= MAX_ACTIVE_ARCS) return;

    const availableTypes = await this.arcQuery.findAvailableArcTypes();
    if (availableTypes.length === 0) return;

    // Build candidates with cooldown info
    const candidates: ArcSpawnCandidate[] = [];
    for (const arcType of availableTypes) {
      const lastEnded = await this.arcQuery.findLastEndedInstance(arcType.id);
      candidates.push({
        arcTypeId: arcType.id,
        code: arcType.code,
        lastEndedAtTick: lastEnded?.endedAtTick ?? null,
      });
    }

    const eligible = filterArcCandidatesByCooldown(
      candidates,
      tickIndex,
      ARC_COOLDOWN_TICKS,
    );

    // Spawn until we hit MAX_ACTIVE_ARCS or run out of candidates
    let currentCount = remainingActiveCount;
    let spawnIndex = 0;
    const remaining = [...eligible];

    while (currentCount < MAX_ACTIVE_ARCS && remaining.length > 0) {
      const seed = `spawn:arc:${tickIndex}:${spawnIndex}`;
      const selected = selectArcType(remaining, seed);
      if (!selected) break;

      await this.arcRepo.createInstance(
        {
          arcTypeId: selected.arcTypeId,
          state: 'spark',
          ticksInCurrentState: 0,
          progress: 0.1,
          startedAtTick: tickIndex,
          isActive: true,
        },
        tx,
      );

      outEvents.push({
        type: 'arc',
        arcTypeName: selected.code,
        fromState: 'background',
        toState: 'spark',
      });

      // Remove from remaining to avoid double-spawn
      const idx = remaining.findIndex(
        (c) => c.arcTypeId === selected.arcTypeId,
      );
      remaining.splice(idx, 1);
      currentCount++;
      spawnIndex++;
    }
  }

  // ── Policy Respawn ──────────────────────────────────────────────

  private async spawnPoliciesIfNeeded(
    tickIndex: bigint,
    remainingActiveCount: number,
    arcActiveInstances: ArcInstanceWithTypeRow[],
    outEvents: PolicyTransitionEvent[],
    tx: TxClient,
  ): Promise<void> {
    if (remainingActiveCount >= MAX_ACTIVE_POLICIES) return;

    const availableTemplates = await this.policyQuery.findAvailableTemplates(
      tickIndex,
      POLICY_COOLDOWN_TICKS,
    );
    if (availableTemplates.length === 0) return;

    // Active arc sector IDs for alignment preference
    const activeArcSectorIds = [
      ...new Set(
        arcActiveInstances.flatMap((inst) =>
          inst.arcType.sectorImpacts.map((si) => si.sectorId),
        ),
      ),
    ];

    // Build candidates
    const candidates: PolicySpawnCandidate[] = availableTemplates.map((t) => ({
      templateId: t.id,
      code: t.code,
      rarity: t.rarity,
      affectedSectors: [...new Set(t.sectorImpacts.map((si) => si.sectorId))],
    }));

    let currentCount = remainingActiveCount;
    let spawnIndex = 0;
    const remaining = [...candidates];

    while (currentCount < MAX_ACTIVE_POLICIES && remaining.length > 0) {
      const seed = `spawn:policy:${tickIndex}:${spawnIndex}`;
      const selected = selectPolicyTemplate(
        remaining,
        activeArcSectorIds,
        seed,
      );
      if (!selected) break;

      await this.policyRepo.createInstance(
        {
          templateId: selected.templateId,
          state: 'declared_path',
          ticksInCurrentState: 0,
          actionsTotal: 3,
          actionsCompleted: 0,
          startedAtTick: tickIndex,
          isActive: true,
        },
        tx,
      );

      const template = availableTemplates.find(
        (t) => t.id === selected.templateId,
      );
      const descriptions = template?.stateDescriptions as Record<
        string,
        string
      > | null;
      outEvents.push({
        type: 'policy',
        templateTitle: template?.title ?? selected.code,
        fromState: 'undeclared',
        toState: 'declared_path',
        stateDescription: descriptions?.['declared_path'] ?? null,
      });

      const idx = remaining.findIndex(
        (c) => c.templateId === selected.templateId,
      );
      remaining.splice(idx, 1);
      currentCount++;
      spawnIndex++;
    }
  }
}
