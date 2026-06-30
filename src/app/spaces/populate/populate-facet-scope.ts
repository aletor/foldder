import { normalizeSchemaToken } from "./populate-entity-groups";
import type { PopulateEntityFacet, PopulateEntityGroup } from "./populate-entity-groups";

/** Identidad del tipo de campo dinámico (p. ej. `image::perfil`) sin distinguir entidad. */
export function facetSlotIdentity(facet: PopulateEntityFacet): string {
  const label = normalizeSchemaToken(facet.field.slotLabel ?? facet.label);
  return `${facet.kind}::${label || "campo"}`;
}

export function facetSlotDisplayName(facet: PopulateEntityFacet): string {
  return (facet.field.slotLabel ?? facet.label).trim() || "campo";
}

/** Todos los slotKey del template con el mismo tipo de campo dinámico. */
export function matchingFacetSlotKeys(
  entities: PopulateEntityGroup[],
  facet: PopulateEntityFacet,
): string[] {
  const identity = facetSlotIdentity(facet);
  return entities.flatMap((entity) =>
    entity.facets.filter((f) => facetSlotIdentity(f) === identity).map((f) => f.slotKey),
  );
}

export function hasMatchingFacetsElsewhere(
  entities: PopulateEntityGroup[],
  entityId: string,
  facet: PopulateEntityFacet,
): boolean {
  const identity = facetSlotIdentity(facet);
  return entities.some(
    (entity) =>
      entity.entityId !== entityId &&
      entity.facets.some((f) => facetSlotIdentity(f) === identity),
  );
}
