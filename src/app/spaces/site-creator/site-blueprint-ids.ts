/** Prefijos estables para nodos del Blueprint (nunca derivados de nombre/posición). */

let seq = 0;

export function resetSiteBlueprintIdSeqForTests(next = 0): void {
  seq = next;
}

function nextToken(): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : `${Date.now().toString(36)}${seq.toString(36)}`;
  return `${rand}${seq.toString(36)}`;
}

export function createSiteSectionId(): string {
  return `scsec_${nextToken()}`;
}

export function createSiteLayoutGroupId(): string {
  return `scgrp_${nextToken()}`;
}

export function createSiteComponentId(): string {
  return `sccmp_${nextToken()}`;
}
