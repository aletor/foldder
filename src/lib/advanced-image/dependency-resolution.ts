import {
  stableHash,
  type AdvancedImageCorrection,
  type AdvancedImageSession,
} from "./domain";
import {
  readAdvancedImageDependencyInstructionCache,
  writeAdvancedImageDependencyInstructionCache,
  type AdvancedImageCacheStore,
} from "./cache";
import { computeZoneOverlapMetrics } from "./mask";

export type AdvancedImageStrongDependencyReason = "explicit" | "geometric";

export type AdvancedImageStrongDependencyPair = {
  dependencyId: string;
  modifierId: string;
  reasons: AdvancedImageStrongDependencyReason[];
};

export type AdvancedImageResolvedStrongDependency = {
  dependencyId: string;
  hash: string;
  modifierId: string;
  resolvedInstruction: string;
  source: "cache" | "heuristic" | "llm";
};

export type AdvancedImageDependencyInstructionResolutionRequest = {
  dependencyInstruction: string;
  dependencyZoneDescription: string;
  modifierInstruction: string;
  modifierZoneDescription: string;
};

export type AdvancedImageDependencyInstructionResolutionTransport = (
  request: AdvancedImageDependencyInstructionResolutionRequest,
  context: {
    requestId: string;
    userEmail: string;
  },
) => Promise<{ model?: string; raw?: unknown; resolvedInstruction: string }>;

export type AdvancedImageDependencyResolutionLogger = (event: {
  dependencyId: string;
  hash: string;
  hit: boolean;
  modifierId: string;
  source: "cache" | "heuristic" | "llm";
}) => void;

const DEFAULT_OVERLAP_OLD_THRESHOLD = 0.3;

export function findAdvancedImageStrongDependencyPairs(
  session: AdvancedImageSession,
  batchPendingIds: string[],
): AdvancedImageStrongDependencyPair[] {
  const pending = new Set(batchPendingIds);
  const active = session.corrections
    .filter((correction) => correction.status === "active")
    .slice()
    .sort((a, b) => a.order - b.order);
  const pairs = new Map<string, AdvancedImageStrongDependencyPair>();

  for (const modifier of active.filter((correction) => pending.has(correction.id))) {
    const previous = active.filter((correction) => correction.order < modifier.order);
    for (const dependency of previous) {
      const reasons: AdvancedImageStrongDependencyReason[] = [];
      if (modifier.dependencies.includes(dependency.id)) reasons.push("explicit");
      if (hasStrongGeometricDependency(dependency, modifier)) reasons.push("geometric");
      if (reasons.length === 0) continue;
      pairs.set(`${dependency.id}:${modifier.id}`, {
        dependencyId: dependency.id,
        modifierId: modifier.id,
        reasons: uniqueReasons(reasons),
      });
    }
  }

  return Array.from(pairs.values()).sort((a, b) => {
    const modifierOrderA = active.find((correction) => correction.id === a.modifierId)?.order ?? 0;
    const modifierOrderB = active.find((correction) => correction.id === b.modifierId)?.order ?? 0;
    if (modifierOrderA !== modifierOrderB) return modifierOrderA - modifierOrderB;
    const dependencyOrderA = active.find((correction) => correction.id === a.dependencyId)?.order ?? 0;
    const dependencyOrderB = active.find((correction) => correction.id === b.dependencyId)?.order ?? 0;
    return dependencyOrderA - dependencyOrderB;
  });
}

export function advancedImageDependencyResolutionHash(args: {
  dependency: Pick<AdvancedImageCorrection, "geometryHash" | "id" | "instructionHash" | "userInstruction">;
  modifier: Pick<AdvancedImageCorrection, "geometryHash" | "id" | "instructionHash" | "userInstruction">;
}): string {
  return stableHash({
    dependency: {
      geometryHash: args.dependency.geometryHash,
      id: args.dependency.id,
      instructionHash: args.dependency.instructionHash,
      userInstruction: args.dependency.userInstruction,
    },
    modifier: {
      geometryHash: args.modifier.geometryHash,
      id: args.modifier.id,
      instructionHash: args.modifier.instructionHash,
      userInstruction: args.modifier.userInstruction,
    },
    version: "advanced-image-dependency-resolution-v1",
  });
}

export async function resolveAdvancedImageStrongDependencies(args: {
  cacheStore: AdvancedImageCacheStore;
  logger?: AdvancedImageDependencyResolutionLogger;
  now: string;
  pairs: AdvancedImageStrongDependencyPair[];
  requestId: string;
  session: AdvancedImageSession;
  transport?: AdvancedImageDependencyInstructionResolutionTransport;
  userEmail: string;
}): Promise<AdvancedImageResolvedStrongDependency[]> {
  const byId = new Map(args.session.corrections.map((correction) => [correction.id, correction]));
  const out: AdvancedImageResolvedStrongDependency[] = [];
  for (const pair of args.pairs) {
    const dependency = byId.get(pair.dependencyId);
    const modifier = byId.get(pair.modifierId);
    if (!dependency || !modifier) continue;
    const hash = advancedImageDependencyResolutionHash({ dependency, modifier });
    const cached = await readAdvancedImageDependencyInstructionCache(
      args.cacheStore,
      hash,
      args.now,
      { requestId: args.requestId, userEmail: args.userEmail },
    );
    if (cached.hit) {
      args.logger?.({ dependencyId: pair.dependencyId, hash, hit: true, modifierId: pair.modifierId, source: "cache" });
      out.push({
        dependencyId: pair.dependencyId,
        hash,
        modifierId: pair.modifierId,
        resolvedInstruction: cached.value.resolvedInstruction,
        source: "cache",
      });
      continue;
    }

    let resolved:
      | { model?: string; raw?: unknown; resolvedInstruction: string }
      | undefined;
    let source: "heuristic" | "llm" = args.transport ? "llm" : "heuristic";
    if (args.transport) {
      try {
        resolved = await args.transport(
          {
            dependencyInstruction: dependency.userInstruction,
            dependencyZoneDescription: dependency.zone.locationDescription,
            modifierInstruction: modifier.userInstruction,
            modifierZoneDescription: modifier.zone.locationDescription,
          },
          { requestId: `${args.requestId}-dep-${pair.dependencyId}-${pair.modifierId}`, userEmail: args.userEmail },
        );
      } catch (error) {
        source = "heuristic";
        resolved = {
          raw: {
            fallbackReason: error instanceof Error ? error.message : String(error),
          },
          resolvedInstruction: heuristicResolvedInstruction(dependency.userInstruction, modifier.userInstruction),
        };
      }
    } else {
      resolved = { resolvedInstruction: heuristicResolvedInstruction(dependency.userInstruction, modifier.userInstruction) };
    }
    const resolvedInstruction = resolved.resolvedInstruction.trim() || heuristicResolvedInstruction(dependency.userInstruction, modifier.userInstruction);
    await writeAdvancedImageDependencyInstructionCache(
      args.cacheStore,
      {
        dependencyId: pair.dependencyId,
        hash,
        modifierId: pair.modifierId,
        model: resolved.model,
        raw: resolved.raw,
        resolvedAt: args.now,
        resolvedInstruction,
      },
      { createdAt: args.now },
      { requestId: args.requestId, userEmail: args.userEmail },
    );
    args.logger?.({
      dependencyId: pair.dependencyId,
      hash,
      hit: false,
      modifierId: pair.modifierId,
      source,
    });
    out.push({
      dependencyId: pair.dependencyId,
      hash,
      modifierId: pair.modifierId,
      resolvedInstruction,
      source,
    });
  }
  return out;
}

function hasStrongGeometricDependency(
  dependency: AdvancedImageCorrection,
  modifier: AdvancedImageCorrection,
): boolean {
  try {
    const metrics = computeZoneOverlapMetrics(modifier.zone, dependency.zone, 96);
    return (
      metrics.containsOldZone ||
      metrics.intersectionOverOld > DEFAULT_OVERLAP_OLD_THRESHOLD ||
      metrics.intersectionOverNew > DEFAULT_OVERLAP_OLD_THRESHOLD
    );
  } catch {
    return false;
  }
}

function heuristicResolvedInstruction(dependencyInstruction: string, modifierInstruction: string): string {
  return [
    dependencyInstruction.trim(),
    `Apply this modification to that same generated element or overlapping area: ${modifierInstruction.trim()}`,
    "Resolve both instructions as one coherent final result, with the modifier overriding any conflicting detail from the original intent.",
  ].filter(Boolean).join(" ");
}

function uniqueReasons(reasons: AdvancedImageStrongDependencyReason[]): AdvancedImageStrongDependencyReason[] {
  return Array.from(new Set(reasons));
}
