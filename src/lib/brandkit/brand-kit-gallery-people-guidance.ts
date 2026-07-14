/** Casting distinto por variante para evitar el mismo rostro en Personas & mood. */
export const PEOPLE_MOOD_CAST_BY_VARIANT = [
  "Cast: adult woman in her late 30s, distinct bone structure, natural skin texture, wardrobe and hair unique to this shot.",
  "Cast: adult man in his mid-20s, different ethnicity, bone structure, and hairstyle from other variants — not the same person.",
  "Cast: figure at medium distance, face secondary or turned away, different silhouette and posture from portrait variants.",
  "Cast: hands, shoulders, or over-shoulder framing only — no identifiable face matching other gallery people shots.",
] as const;

export const PEOPLE_MOOD_ANTI_REPEAT_CORE = [
  "Different individual in each image; do not reuse the same face, bone structure, hair color, or model identity across shots.",
  "Photorealistic editorial human presence with natural skin, believable anatomy, and non-stock posing.",
  "No duplicated character, no twin faces, no same actor across variants.",
].join(" ");

export const PEOPLE_BRIEF_LLM_RULE =
  "Personas y mood: 4 variantes con personas DISTINTAS (edad, rasgos, etnia, pelo, vestuario, encuadre). " +
  "Cada promptHint debe especificar casting concreto, no solo «editorial portrait». " +
  "Prohibido repetir el mismo rostro o modelo entre variantes.";

export const PEOPLE_BRIEF_PROMPT_HINT_RULE =
  "people_mood.variant.promptHint: name a distinct cast (age, gender presentation, features, wardrobe) and framing; never repeat the same face across variants.";

export function peopleMoodCastDirective(variantIndex: number): string {
  return PEOPLE_MOOD_CAST_BY_VARIANT[variantIndex] ?? PEOPLE_MOOD_CAST_BY_VARIANT[0];
}
