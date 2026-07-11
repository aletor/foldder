import type { EvidenceKind } from "./types";

const MARKDOWN_HEADER_RE = /^#{1,6}\s/;
const DOCUMENT_HEADER_RE = /^(?:Document|Página|Page)\s*[:0-9]/i;
const URL_ONLY_RE = /^https?:\/\/\S+$/i;
const PATH_LIKE_RE = /^(?:\.\.?\/|[A-Za-z]:\\|\/Users\/|\/Volumes\/)/;
const MARKDOWN_FENCE_RE = /^```|^\|.+\|/;

/** Evidence kinds allowed to project synthesized voice fields on the Brand Board. */
export const PROJECTABLE_VOICE_EVIDENCE: ReadonlySet<EvidenceKind> = new Set([
  "llm-synthesis",
  "user",
]);

export type RawArtifactOptions = {
  /** Known source filenames (e.g. uploaded PDF names) — matching fragments are artifacts. */
  sourceFilenames?: string[];
};

function normalizeFilenameToken(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function containsSourceFilename(text: string, filenames: string[]): boolean {
  const lower = text.toLowerCase();
  return filenames.some((raw) => {
    const name = normalizeFilenameToken(raw);
    if (!name) return false;
    if (lower.includes(name)) return true;
    const stem = name.replace(/\.[^.]+$/, "");
    return stem.length > 3 && lower.includes(stem);
  });
}

/**
 * Returns true when `text` is parse/upload residue that must never surface as brand voice.
 */
export function isRawArtifact(text: string, options?: RawArtifactOptions): boolean {
  const candidate = text.trim();
  if (!candidate) return true;

  if (MARKDOWN_HEADER_RE.test(candidate)) return true;
  if (DOCUMENT_HEADER_RE.test(candidate)) return true;
  if (URL_ONLY_RE.test(candidate)) return true;
  if (PATH_LIKE_RE.test(candidate)) return true;
  if (MARKDOWN_FENCE_RE.test(candidate)) return true;

  if (options?.sourceFilenames?.length && containsSourceFilename(candidate, options.sourceFilenames)) {
    return true;
  }

  if (/^###\s*Document:/i.test(candidate)) return true;
  if (/^\*\*Empresa:\*\*\s*$/i.test(candidate)) return true;

  return false;
}

export function isProjectableVoiceEvidence(kind: EvidenceKind | undefined): boolean {
  return kind != null && PROJECTABLE_VOICE_EVIDENCE.has(kind);
}

export function filterProjectableToneTraits(
  traits: readonly string[],
  options?: RawArtifactOptions,
): string[] {
  return traits
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !isRawArtifact(t, options))
    .filter((t) => !/^[A-Z][A-Z\s]+$/.test(t));
}
