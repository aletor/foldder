import type { WriterMemoryScope } from "./writer-entities";

export type WriterFact = {
  subject: string;
  predicate: string;
  value: string | number | boolean;
  object?: string;
  confidence: 1;
};

const TENTATIVE =
  /(?:^|\b)(?:quiz[aá]s?|tal vez|a lo mejor|posiblemente|puede que|podr[ií]a|ser[ií]a interesante|quiero que quiz[aá])\b|^idea\s*:/iu;

export function inferWriterMemoryStatus(text: string): "established" | "tentative" {
  return TENTATIVE.test(text.trim()) ? "tentative" : "established";
}

type VerbGroup = {
  id: string;
  first: string[];
  phrases: string[];
};

const VERBS: VerbGroup[] = [
  { id: "read", first: ["leo", "leemos", "leí", "leimos", "leímos", "leyendo"], phrases: ["he leído", "hemos leído"] },
  { id: "write", first: ["escribo", "escribimos", "escribí", "escribimos", "escribiendo"], phrases: ["he escrito", "hemos escrito"] },
  { id: "drive", first: ["conduzco", "conducimos", "conduje", "condujimos", "conduciendo"], phrases: ["he conducido", "hemos conducido"] },
  { id: "walk", first: ["camino", "caminamos", "caminé", "caminando"], phrases: ["he caminado"] },
  { id: "run", first: ["corro", "corremos", "corrí", "corriendo"], phrases: ["he corrido"] },
  { id: "swim", first: ["nado", "nadamos", "nadé", "nadando"], phrases: ["he nadado"] },
  { id: "speak", first: ["hablo", "hablamos", "hablé", "hablando"], phrases: ["he hablado"] },
  { id: "hear", first: ["oigo", "oímos", "oí", "oyendo"], phrases: ["he oído"] },
  { id: "see", first: ["veo", "vemos", "vi", "viendo"], phrases: ["he visto"] },
];

const ABILITY: Record<string, string> = {
  leer: "read",
  escribir: "write",
  conducir: "drive",
  caminar: "walk",
  correr: "run",
  nadar: "swim",
  hablar: "speak",
  oír: "hear",
  oir: "hear",
  ver: "see",
};

export function writerFactsFromMemory(entry: {
  text: string;
  status?: "established" | "tentative";
  scope?: WriterMemoryScope;
}): WriterFact[] {
  if (entry.status === "tentative") return [];
  const text = fold(entry.text);
  const subject = entry.scope?.type === "entity" ? entry.scope.entityId : subjectIn(text);
  if (!subject) return [];
  const facts: WriterFact[] = [];
  const age = text.match(/tiene (\d{1,3}) anos/);
  if (age?.[1]) facts.push({ subject, predicate: "age", value: Number(age[1]), confidence: 1 });
  const unknown = text.match(/no sabe que ([a-z0-9 ]{3,48})/u);
  const known = unknown ? null : text.match(/(?:^| )sabe que ([a-z0-9 ]{3,48})/u);
  const knowledge = slug(unknown?.[1] ?? known?.[1] ?? "");
  if (knowledge) facts.push({ subject, predicate: "knowledge", value: !unknown, object: knowledge, confidence: 1 });
  const lacks = text.match(/no tiene (?:un |una |el |la |los |las )?([a-z]{3,})/u);
  const owns = lacks ? null : text.match(/tiene (?:un |una |el |la )([a-z]{3,})/u);
  const owned = lacks?.[1] || owns?.[1] || "";
  if (owned && owned !== "anos") facts.push({ subject, predicate: "possession", value: !lacks, object: owned, confidence: 1 });
  for (const [verb, id] of Object.entries(ABILITY)) {
    if (text.includes(`no sabe ${verb}`) || text.includes(`no puede ${verb}`)) {
      facts.push({ subject, predicate: `ability.${id}`, value: false, confidence: 1 });
    } else if (text.includes(`sabe ${verb}`) || text.includes(`puede ${verb}`)) {
      facts.push({ subject, predicate: `ability.${id}`, value: true, confidence: 1 });
    }
  }
  if (/se le murieron los padres|sus padres (murieron|fallecieron|estan muertos)|los padres (murieron|estan muertos)/u.test(text)) {
    facts.push({ subject, predicate: "parents.alive", value: false, confidence: 1 });
  }
  if (/(?:^| )(murio|fallecio|esta muerto|esta muerta)(?: |$)/u.test(text)) {
    facts.push({ subject, predicate: "life.alive", value: false, confidence: 1 });
  } else if (/(?:^| )esta vivo(?: |$)|(?:^| )esta viva(?: |$)/u.test(text)) {
    facts.push({ subject, predicate: "life.alive", value: true, confidence: 1 });
  }
  const neverPlace = text.match(/(?:nunca|jamas) ha estado en (?:el |la |los |las )?([a-z0-9-]{3,})/u);
  if (neverPlace?.[1]) facts.push({ subject, predicate: "experience.been", value: false, object: neverPlace[1], confidence: 1 });
  const already = text.match(/ya (?:ha estado|estuvo) en (?:el |la |los |las )?([a-z0-9-]{3,})/u);
  if (already?.[1]) facts.push({ subject, predicate: "experience.been", value: true, object: already[1], confidence: 1 });
  const at = text.match(/(?:^| )esta en (?:el |la |los |las )?([a-z0-9-]{3,})/u);
  if (at?.[1]) facts.push({ subject, predicate: "location.at", value: at[1], confidence: 1 });
  if (/jamas ha conducido|nunca ha conducido/u.test(text)) {
    facts.push({ subject, predicate: "ability.drive", value: false, confidence: 1 });
  }
  const sibling = text.match(/es herman[oa] de ([a-z0-9-]+)/u);
  if (sibling?.[1]) facts.push({ subject, predicate: "relationship.sibling", value: true, object: sibling[1], confidence: 1 });
  const parent = text.match(/es (padre|madre) de ([a-z0-9-]+)/u);
  if (parent?.[2]) facts.push({ subject, predicate: "relationship.parent", value: true, object: parent[2], confidence: 1 });
  const child = text.match(/es hij[oa] de ([a-z0-9-]+)/u);
  if (child?.[1]) facts.push({ subject, predicate: "relationship.child", value: true, object: child[1], confidence: 1 });
  const lives = text.match(/vive en (?:el |la |los |las )?([a-z0-9-]{3,})/u);
  if (lives?.[1]) facts.push({ subject, predicate: "location.lives", value: lives[1], confidence: 1 });
  const outcome = hardOutcome(text);
  if (outcome) facts.push({ subject, predicate: "outcome", value: outcome.value, object: outcome.object, confidence: 1 });
  return facts;
}

export type WriterClaim = {
  subject: string;
  predicate: string;
  value: string | number | boolean;
  object?: string;
};

export function writerClaimsInText(text: string, speakerId: string | null): WriterClaim[] {
  const folded = fold(text);
  if (!folded) return [];
  const claims: WriterClaim[] = [];
  if (speakerId) {
    claims.push({ subject: speakerId, predicate: "life.speaking", value: true });
    for (const group of VERBS) {
      if (group.phrases.some((phrase) => folded.includes(fold(phrase))) || group.first.some((form) => hasWord(folded, fold(form)))) {
        claims.push({ subject: speakerId, predicate: `action.${group.id}`, value: true });
      }
    }
    const age = folded.match(/tengo (\d{1,3}) anos/);
    if (age?.[1]) claims.push({ subject: speakerId, predicate: "age", value: Number(age[1]) });
    const been = folded.match(/(?:estuve|he estado) en (?:el |la |los |las )?([a-z0-9-]{3,})/u);
    if (been?.[1]) claims.push({ subject: speakerId, predicate: "experience.been", value: true, object: been[1] });
    const neverBeen = folded.match(/(?:nunca|jamas) he estado en (?:el |la |los |las )?([a-z0-9-]{3,})/u);
    if (neverBeen?.[1]) claims.push({ subject: speakerId, predicate: "experience.been", value: false, object: neverBeen[1] });
    const lacks = folded.match(/no tengo (?:un |una |el |la |los |las )?([a-z]{3,})/u);
    const owns = lacks ? null : folded.match(/tengo (?:un |una |el |la )([a-z]{3,})/u);
    const owned = lacks?.[1] || owns?.[1] || "";
    if (owned && owned !== "anos") claims.push({ subject: speakerId, predicate: "possession", value: !lacks, object: owned });
    const unknown = folded.match(/no se que ([a-z0-9 ]{3,48})/u);
    const known = unknown ? null : folded.match(/(?:^| )se que ([a-z0-9 ]{3,48})/u);
    const knowledge = slug(unknown?.[1] ?? known?.[1] ?? "");
    if (knowledge) claims.push({ subject: speakerId, predicate: "knowledge", value: !unknown, object: knowledge });
    if (/mis padres (viven|estan vivos|estan vivas)/u.test(folded)) {
      claims.push({ subject: speakerId, predicate: "parents.alive", value: true });
    }
    const outcome = hardOutcome(folded, true);
    if (outcome) claims.push({ subject: speakerId, predicate: "outcome", value: outcome.value, object: outcome.object });
  }
  const namedAge = folded.match(/([a-z0-9-]+)\s+tiene (\d{1,3}) anos/);
  if (namedAge?.[1] && namedAge[2]) claims.push({ subject: namedAge[1], predicate: "age", value: Number(namedAge[2]) });
  const aged = folded.match(/a sus (\d{1,3}) anos\s+([a-z0-9-]+)/u);
  if (aged?.[1] && aged[2]) claims.push({ subject: aged[2], predicate: "age", value: Number(aged[1]) });
  return claims;
}

export function writerFactConflicts(fact: WriterFact, claim: WriterClaim): boolean {
  if (fact.subject !== claim.subject) return false;
  if (fact.predicate.startsWith("ability.") && fact.value === false && claim.predicate === `action.${fact.predicate.slice("ability.".length)}` && claim.value === true) {
    return true;
  }
  if (fact.predicate === "age" && claim.predicate === "age" && fact.value !== claim.value) return true;
  if (fact.predicate === "life.alive" && fact.value === false && claim.predicate === "life.speaking") return true;
  if (fact.predicate === "parents.alive" && fact.value === false && claim.predicate === "parents.alive" && claim.value === true) return true;
  if (
    (fact.predicate === "experience.been" || fact.predicate === "possession" || fact.predicate === "knowledge" || fact.predicate === "outcome") &&
    fact.predicate === claim.predicate &&
    fact.object &&
    fact.object === claim.object &&
    fact.value !== claim.value
  ) {
    return true;
  }
  return false;
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z])${word}(?![a-z])`, "u").test(text);
}

function hardOutcome(text: string, firstPersonOnly = false): { value: "failed" | "passed"; object: string } | null {
  const failed = firstPersonOnly ? null : text.match(/(?:^| )suspendio ([a-z]{4,})(?: |$)/u);
  const failedFirst = text.match(/(?:^| )suspendi ([a-z]{4,})(?: |$)/u);
  const fail = failed ?? failedFirst;
  if (fail?.[1]) return { value: "failed", object: fail[1] };
  const passed = firstPersonOnly ? null : text.match(/(?:^| )aprobo ([a-z]{4,})(?: |$)/u);
  const passedFirst = text.match(/(?:^| )aprobe ([a-z]{4,})(?: |$)/u);
  const pass = passed ?? passedFirst;
  if (pass?.[1]) return { value: "passed", object: pass[1] };
  return null;
}

function slug(text: string): string {
  return text
    .split(" ")
    .filter((word) => word.length >= 3 && !["que", "los", "las", "una", "unos"].includes(word))
    .slice(0, 3)
    .join("-");
}

function subjectIn(text: string): string {
  const named = text.match(/^([a-z0-9-]+)\s+(?:no\s+)?(?:sabe|puede|tiene|vive|murio|fallecio|esta|es)\b/u);
  return named?.[1] ?? "";
}
