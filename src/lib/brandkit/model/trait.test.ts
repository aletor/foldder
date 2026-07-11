import { describe, expect, it } from "vitest";

import {
  createCandidate,
  scoreFromSignals,
  signal,
  type Candidate,
  type CandidateStatus,
} from "./evidence";
import { fontFamilySignature, signatureDistance, signaturesMatch, textSignature } from "./signature";
import {
  addCandidate,
  archiveCandidate,
  createTrait,
  crown,
  crownedCandidates,
  emptyGenome,
  normalizeGenome,
  topCandidate,
  uncrown,
  upsertTrait,
} from "./trait";
import { classifyIncoming } from "./new-material";

function cand(over: { id: string; score?: number; signature?: string; createdAt?: string }): Candidate<string> {
  // Construimos señales que produzcan aproximadamente el score deseado no es
  // necesario aquí: fijamos el score directamente para tests de ranking.
  const base = createCandidate<string>({
    id: over.id,
    value: over.id,
    signals: [signal("headline")],
    signature: over.signature ?? over.id,
    createdAt: over.createdAt,
  });
  return over.score != null ? { ...base, evidenceScore: over.score } : base;
}

describe("scoreFromSignals", () => {
  it("user-supplied gana siempre (score = 1)", () => {
    expect(scoreFromSignals([signal("user-supplied")])).toBe(1);
    // aunque haya señales negativas, el usuario manda
    expect(scoreFromSignals([signal("user-supplied"), signal("footer"), signal("single-appearance")])).toBe(1);
  });

  it("sin señales = 0", () => {
    expect(scoreFromSignals([])).toBe(0);
  });

  it("más contexto positivo ⇒ mayor score que contexto negativo", () => {
    const strong = scoreFromSignals([signal("near-logo"), signal("headline"), signal("brand-manual")]);
    const weak = scoreFromSignals([signal("footer"), signal("single-appearance")]);
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(0.5);
  });

  it("el score está acotado en 0..1", () => {
    const s = scoreFromSignals([signal("near-logo", { scale: 100 })]);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("createCandidate", () => {
  it("deriva el score de las señales (no editable a mano)", () => {
    const c = createCandidate({ value: "Montserrat", signals: [signal("near-logo"), signal("headline")], signature: "montserrat" });
    expect(c.evidenceScore).toBeCloseTo(scoreFromSignals([signal("near-logo"), signal("headline")]));
    expect(c.status).toBe("proposed");
  });

  it("nace user_supplied si tiene señal user-supplied", () => {
    const c = createCandidate({ value: "logo.png", signals: [signal("user-supplied")], signature: "abcd" });
    expect(c.status).toBe("user_supplied");
    expect(c.evidenceScore).toBe(1);
  });
});

describe("addCandidate — ranking, sin merge", () => {
  it("mantiene el orden por evidencia desc", () => {
    let t = createTrait<string>("typography.primary");
    t = addCandidate(t, cand({ id: "low", score: 0.2 }));
    t = addCandidate(t, cand({ id: "high", score: 0.9 }));
    t = addCandidate(t, cand({ id: "mid", score: 0.5 }));
    expect(t.candidates.map((c) => c.id)).toEqual(["high", "mid", "low"]);
    expect(topCandidate(t)?.id).toBe("high");
  });

  it("reemplaza por id en vez de duplicar", () => {
    let t = createTrait<string>("typography.primary");
    t = addCandidate(t, cand({ id: "x", score: 0.3 }));
    t = addCandidate(t, cand({ id: "x", score: 0.8 }));
    expect(t.candidates).toHaveLength(1);
    expect(t.candidates[0].evidenceScore).toBe(0.8);
  });
});

describe("crown — single: corona + archiva el resto atómicamente", () => {
  it("coronar deja crownedIds=[id] y archiva TODO lo demás", () => {
    let t = createTrait<string>("logo.primary");
    t = addCandidate(t, cand({ id: "a", score: 0.9 }));
    t = addCandidate(t, cand({ id: "b", score: 0.7 }));
    t = addCandidate(t, cand({ id: "c", score: 0.4 }));
    t = crown(t, "b");

    expect(t.crownedIds).toEqual(["b"]);
    const byId = Object.fromEntries(t.candidates.map((c) => [c.id, c.status]));
    expect(byId).toEqual({ a: "archived", b: "crowned", c: "archived" });
  });

  it("coronar otro mueve la corona (re-corona, sin estado intermedio)", () => {
    let t = createTrait<string>("logo.primary");
    t = addCandidate(t, cand({ id: "a", score: 0.9 }));
    t = addCandidate(t, cand({ id: "b", score: 0.7 }));
    t = crown(t, "a");
    t = crown(t, "b"); // el usuario cambia de opinión

    expect(t.crownedIds).toEqual(["b"]);
    const byId = Object.fromEntries(t.candidates.map((c) => [c.id, c.status]));
    expect(byId).toEqual({ a: "archived", b: "crowned" });
  });

  it("id inexistente no cambia nada", () => {
    let t = createTrait<string>("logo.primary");
    t = addCandidate(t, cand({ id: "a", score: 0.9 }));
    const before = JSON.stringify(t);
    t = crown(t, "zzz");
    expect(JSON.stringify(t)).toBe(before);
  });
});

describe("crown — multi: cada tarjeta independiente", () => {
  it("coronar no archiva a los hermanos", () => {
    let t = createTrait<string>("image.people");
    t = addCandidate(t, cand({ id: "p1", score: 0.8 }));
    t = addCandidate(t, cand({ id: "p2", score: 0.6 }));
    t = addCandidate(t, cand({ id: "p3", score: 0.5 }));
    t = crown(t, "p1");
    t = crown(t, "p3");

    expect(t.crownedIds).toEqual(["p1", "p3"]);
    const byId = Object.fromEntries(t.candidates.map((c) => [c.id, c.status]));
    expect(byId).toEqual({ p1: "crowned", p2: "proposed", p3: "crowned" });
    expect(crownedCandidates(t).map((c) => c.id).sort()).toEqual(["p1", "p3"]);
  });
});

describe("uncrown — deshacer", () => {
  it("devuelve el candidato a proposed y lo saca de crownedIds", () => {
    let t = createTrait<string>("logo.primary");
    t = addCandidate(t, cand({ id: "a", score: 0.9 }));
    t = crown(t, "a");
    t = uncrown(t, "a");
    expect(t.crownedIds).toEqual([]);
    expect(t.candidates[0].status).toBe("proposed");
  });
});

/**
 * EL test que garantiza que BrandKit no re-deriva hacia Brain. Cubre las tres
 * propiedades concretas: (1) ninguna operación fusiona dos candidatos en uno,
 * (2) coronar archiva el resto en UNA operación atómica, (3) el modelo no tiene
 * estado ni campo `conflict`.
 */
describe("núcleo: sin merge, sin conflict (garantía dura)", () => {
  it("(1) ninguna operación combina candidatos ni inventa un valor fusionado", () => {
    let t = createTrait<string>("logo.primary");
    t = addCandidate(t, cand({ id: "a", score: 0.9 })); // value "a"
    t = addCandidate(t, cand({ id: "b", score: 0.7 })); // value "b"
    t = addCandidate(t, cand({ id: "c", score: 0.5 })); // value "c"
    const valuesBefore = t.candidates.map((c) => c.value).sort();

    // Ejercemos TODAS las operaciones que tocan candidatos.
    t = crown(t, "b");
    t = uncrown(t, "b");
    t = crown(t, "a");
    t = archiveCandidate(t, "c");

    const valuesAfter = t.candidates.map((c) => c.value).sort();
    // El conjunto de valores es EXACTAMENTE el mismo: nunca aparece "a+b".
    expect(valuesAfter).toEqual(valuesBefore);
    expect(valuesAfter).toEqual(["a", "b", "c"]);
    // Y siguen siendo 3 candidatos distintos (no se colapsó ninguno en otro).
    expect(t.candidates).toHaveLength(3);
  });

  it("(1b) el módulo no exporta ninguna función de merge/combine/fusión", async () => {
    // Guardia de superficie de API: si alguien añade un `mergeCandidates`, salta.
    const api = await import("../index");
    const forbidden = Object.keys(api).filter((k) => /merge|combine|fus(e|ion)|blend/i.test(k));
    expect(forbidden).toEqual([]);
  });

  it("(2) coronar en single archiva TODO el resto en UNA sola llamada (atómico)", () => {
    let t = createTrait<string>("logo.primary");
    for (const [id, score] of [["a", 0.9], ["b", 0.8], ["c", 0.6], ["d", 0.4]] as const) {
      t = addCandidate(t, cand({ id, score }));
    }
    const after = crown(t, "c"); // UNA operación
    expect(after.crownedIds).toEqual(["c"]);
    const crowned = after.candidates.filter((c) => c.status === "crowned").map((c) => c.id);
    const archived = after.candidates.filter((c) => c.status === "archived").map((c) => c.id).sort();
    expect(crowned).toEqual(["c"]);
    expect(archived).toEqual(["a", "b", "d"]); // los tres, de golpe
  });

  it("(2b) coronar es puro: no muta el trait de entrada", () => {
    let t = createTrait<string>("logo.primary");
    t = addCandidate(t, cand({ id: "a", score: 0.9 }));
    t = addCandidate(t, cand({ id: "b", score: 0.7 }));
    const snapshot = JSON.stringify(t);
    const next = crown(t, "a");
    expect(JSON.stringify(t)).toBe(snapshot); // entrada intacta
    expect(next).not.toBe(t);
  });

  it("(3) el modelo no tiene estado ni campo 'conflict'", () => {
    // Nivel de tipos: "conflict" NO es un CandidateStatus (falla la compilación si lo fuera).
    const _noConflictStatus: Extract<CandidateStatus, "conflict"> extends never ? true : never = true;
    expect(_noConflictStatus).toBe(true);

    let t = createTrait<string>("logo.primary");
    t = addCandidate(t, cand({ id: "a", score: 0.9 }));
    t = crown(t, "a");
    // Estructural: el trait no expone campo `conflict` (BrandKit sí: InterpretationMeta.conflict).
    expect("conflict" in t).toBe(false);
    expect(Object.keys(t).sort()).toEqual(
      ["candidates", "cardinality", "crownedIds", "id", "updatedAt"],
    );
    // Ningún candidato puede estar en un estado fuera del conjunto cerrado.
    const allowed = new Set<CandidateStatus>(["proposed", "crowned", "archived", "user_supplied"]);
    expect(t.candidates.every((c) => allowed.has(c.status))).toBe(true);
  });

  it("(flagship) evidencia nueva contradictoria re-rankea, pero no fusiona, no crea conflict, ni destrona la corona", () => {
    let t = createTrait<string>("typography.primary");
    t = addCandidate(t, cand({ id: "montserrat", score: 0.7 }));
    t = crown(t, "montserrat"); // el usuario corona Montserrat

    // Llega evidencia MÁS fuerte para OTRA familia (el caso que en Brain forzaba merge/conflict).
    t = addCandidate(t, cand({ id: "georgia", score: 0.95 }));

    const byId = Object.fromEntries(t.candidates.map((c) => [c.id, c.status]));
    expect(t.crownedIds).toEqual(["montserrat"]); // la corona es del usuario: la evidencia no la mueve
    expect(byId.montserrat).toBe("crowned");
    expect(byId.georgia).toBe("proposed"); // entra como propuesta, jamás fusionada ni en conflict
    // Ambos valores coexisten intactos: no existe "montserrat+georgia".
    expect(t.candidates.map((c) => c.value).sort()).toEqual(["georgia", "montserrat"]);
    // El ranking sí refleja la evidencia (georgia arriba), pero eso es orden, no corona.
    expect(topCandidate(t)?.id).toBe("georgia");
  });
});

describe("fontFamilySignature — identidad = familia, no peso/estilo", () => {
  it("las variantes de peso/estilo colapsan a UNA firma de familia", () => {
    const variants = [
      "BCDEEE+Montserrat-Bold",
      "Montserrat-Regular",
      "Montserrat Bold",
      "MontserratSemiBold", // peso pegado en camelCase
      "Montserrat-BoldItalic",
      "Montserrat 700",
      "Montserrat",
    ];
    const sigs = new Set(variants.map(fontFamilySignature));
    expect([...sigs]).toEqual(["montserrat"]); // todas → "montserrat"
  });

  it("el peso NO se quita en textSignature (mensajes/claims conservan la palabra)", () => {
    // Un tagline "Be Bold" no debe colapsar a "Be": "bold" es significativo aquí.
    expect(textSignature("Be Bold")).not.toBe(textSignature("Be"));
    // pero como IDENTIDAD de fuente sí colapsa (por eso son funciones distintas)
    expect(fontFamilySignature("Montserrat Bold")).toBe(fontFamilySignature("Montserrat"));
  });
});

describe("classifyIncoming (§4) — pregunta cerrada, no merge", () => {
  // La identidad de la tipografía es la familia: usamos fontFamilySignature.
  const montserrat = fontFamilySignature("Montserrat");

  function genomeWithCrownedMontserrat() {
    let t = createTrait<string>("typography.primary");
    t = addCandidate(t, cand({ id: "montserrat", score: 0.8, signature: montserrat }));
    t = crown(t, "montserrat"); // el usuario ya coronó Montserrat
    return upsertTrait(emptyGenome(), t);
  }

  it("llega Montserrat Bold con Montserrat ya coronada ⇒ known, NO dispara modal", () => {
    const genome = genomeWithCrownedMontserrat();
    // Nuevo documento donde aparece el PESO Bold de la misma familia de marca.
    const bold = cand({ id: "bold", score: 0.9, signature: fontFamilySignature("BCDEEE+Montserrat-Bold") });
    expect(bold.signature).toBe(montserrat); // mismo ADN de identidad
    const verdict = classifyIncoming(genome, "typography.primary", bold);
    expect(verdict.kind).toBe("known"); // silencio: es el ruido que BrandKit evita
    if (verdict.kind === "known") expect(verdict.matchedCandidateId).toBe("montserrat");
  });

  it("novedad real (otra familia) con evidencia suficiente ⇒ prompt", () => {
    const genome = genomeWithCrownedMontserrat();
    const georgia = cand({ id: "georgia", score: 0.9, signature: fontFamilySignature("Georgia") });
    expect(classifyIncoming(genome, "typography.primary", georgia).kind).toBe("prompt");
  });

  it("evidencia baja ⇒ noise (archivado sin molestar)", () => {
    const genome = genomeWithCrownedMontserrat();
    const junk = cand({ id: "junk", score: 0.2, signature: fontFamilySignature("Wingdings") });
    expect(classifyIncoming(genome, "typography.primary", junk).kind).toBe("noise");
  });

  it("aporte del usuario nunca es silencio ni ruido (siempre prompt)", () => {
    const genome = genomeWithCrownedMontserrat();
    const userCand = createCandidate<string>({
      id: "u",
      value: "Georgia",
      signals: [signal("user-supplied")],
      signature: fontFamilySignature("Georgia"),
    });
    expect(classifyIncoming(genome, "typography.primary", userCand).kind).toBe("prompt");
  });

  it("pHash binario: distancia Hamming bit a bit", () => {
    const a = "1010".padEnd(1024, "0");
    const b = "1011".padEnd(1024, "0");
    expect(signatureDistance(a, b)).toBe(1);
    expect(signaturesMatch(a, b, 12)).toBe(true);
  });
});

describe("normalizeGenome — persistencia tolerante", () => {
  it("basura ⇒ brandKit vacío coherente", () => {
    const g = normalizeGenome("nope");
    expect(g.traits).toEqual({});
    expect(g.completenessPercent).toBe(0);
  });

  it("single trait no admite más de una corona aunque el dato venga sucio", () => {
    const dirty = {
      traits: {
        "logo.primary": {
          candidates: [
            { id: "a", status: "crowned" },
            { id: "b", status: "crowned" },
          ],
          crownedIds: ["a", "b"],
        },
      },
    };
    const g = normalizeGenome(dirty);
    expect(g.traits["logo.primary"]?.crownedIds).toHaveLength(1);
  });

  it("descarta crownedIds que no existen entre los candidatos", () => {
    const dirty = {
      traits: {
        "image.people": {
          candidates: [{ id: "p1", status: "crowned" }],
          crownedIds: ["p1", "ghost"],
        },
      },
    };
    const g = normalizeGenome(dirty);
    expect(g.traits["image.people"]?.crownedIds).toEqual(["p1"]);
  });
});
