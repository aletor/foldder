import type { SiteAdnContext } from "./site-adn";
import { createManualBlock } from "./site-defaults";
import { patchButtonLocaleLabel, patchTextLocaleValue } from "./site-i18n";
import type { Block, SiteFactoryPresetId, TextContent, ButtonContent } from "./site-types";

export type SiteGenerateCopyAction =
  | "hero"
  | "manifesto"
  | "faq"
  | "pricing"
  | "cta"
  | "rewrite";

const ACTION_LABELS: Record<SiteGenerateCopyAction, string> = {
  hero: "Hero (titular + subtítulo)",
  manifesto: "Manifiesto de marca",
  faq: "Preguntas frecuentes",
  pricing: "Planes y pricing",
  cta: "Llamada a la acción",
  rewrite: "Reescritura del texto seleccionado",
};

export function buildSiteGenerateCopyPrompt(args: {
  action: SiteGenerateCopyAction;
  locale: string;
  brandContext?: SiteAdnContext | null;
  currentText?: string;
  presetId?: SiteFactoryPresetId;
}): { system: string; user: string } {
  const brandName = args.brandContext?.brandName?.trim() || "la marca";
  const oneLiner = args.brandContext?.oneLiner?.trim();
  const locale = args.locale.trim() || "es";

  const system = [
    "Eres un copywriter web senior.",
    `Escribe en ${locale === "en" ? "inglés" : locale === "ca" ? "catalán" : "español"}.`,
    "Devuelve SOLO JSON válido sin markdown.",
    "Tono claro, premium, sin clichés.",
  ].join(" ");

  const brandBlock = oneLiner
    ? `Marca: ${brandName}. One-liner: ${oneLiner}.`
    : `Marca: ${brandName}.`;

  if (args.action === "rewrite") {
    return {
      system,
      user: `${brandBlock}\nReescribe este texto manteniendo el significado:\n"""${args.currentText ?? ""}"""\nJSON: {"text":"..."}`,
    };
  }

  if (args.action === "faq") {
    return {
      system,
      user: `${brandBlock}\nGenera 3 FAQs.\nJSON: {"items":[{"question":"...","answer":"..."}]}`,
    };
  }

  if (args.action === "pricing") {
    return {
      system,
      user: `${brandBlock}\nGenera 3 planes pricing.\nJSON: {"plans":[{"name":"...","price":"...","description":"...","cta":"..."}]}`,
    };
  }

  const task = ACTION_LABELS[args.action] ?? "copy web";
  return {
    system,
    user: `${brandBlock}\nTarea: ${task}.\nJSON: {"headline":"...","body":"...","cta":"..."}`,
  };
}

export type SiteGeneratedCopy =
  | { kind: "text"; text: string }
  | { kind: "hero"; headline: string; body: string; cta?: string }
  | { kind: "faq"; items: Array<{ question: string; answer: string }> }
  | { kind: "pricing"; plans: Array<{ name: string; price: string; description: string; cta: string }> };

export function parseSiteGeneratedCopy(action: SiteGenerateCopyAction, raw: string): SiteGeneratedCopy {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (action === "rewrite") {
    return { kind: "text", text: String(parsed.text ?? "").trim() };
  }
  if (action === "faq") {
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      kind: "faq",
      items: items.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          question: String(row.question ?? "").trim(),
          answer: String(row.answer ?? "").trim(),
        };
      }),
    };
  }
  if (action === "pricing") {
    const plans = Array.isArray(parsed.plans) ? parsed.plans : [];
    return {
      kind: "pricing",
      plans: plans.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          name: String(row.name ?? "").trim(),
          price: String(row.price ?? "").trim(),
          description: String(row.description ?? "").trim(),
          cta: String(row.cta ?? "Elegir plan").trim(),
        };
      }),
    };
  }
  return {
    kind: "hero",
    headline: String(parsed.headline ?? "").trim(),
    body: String(parsed.body ?? "").trim(),
    cta: String(parsed.cta ?? "").trim() || undefined,
  };
}

export function applyGeneratedCopyToSection(
  section: Block,
  result: SiteGeneratedCopy,
  locale: string,
): Block {
  const next = structuredClone(section);

  if (result.kind === "text") {
    if (next.type !== "text") return next;
    next.content = patchTextLocaleValue(next.content as TextContent, locale, result.text);
    return next;
  }

  if (result.kind === "hero") {
    if (next.type === "text") {
      next.content = patchTextLocaleValue(
        { ...(next.content as TextContent), role: "h1" },
        locale,
        result.headline,
      );
    }
    const bodyBlock = next.children?.find((child) => child.type === "text");
    if (bodyBlock && bodyBlock.type === "text") {
      bodyBlock.content = patchTextLocaleValue(bodyBlock.content as TextContent, locale, result.body);
    }
    const buttonBlock = next.children?.find((child) => child.type === "button");
    if (buttonBlock && buttonBlock.type === "button" && result.cta) {
      buttonBlock.content = patchButtonLocaleLabel(
        buttonBlock.content as ButtonContent,
        locale,
        result.cta,
      );
    }
    return next;
  }

  if (result.kind === "faq") {
    const children: Block[] = [];
    for (const item of result.items) {
      children.push(
        createManualBlock("text", { role: "h3", value: item.question, maxWidth: "narrow" }),
        createManualBlock("text", { role: "body", value: item.answer, maxWidth: "narrow" }),
      );
    }
    next.children = children;
    return next;
  }

  if (result.kind === "pricing") {
    const children: Block[] = [];
    for (const plan of result.plans) {
      children.push(
        createManualBlock("text", {
          role: "h3",
          value: `${plan.name} — ${plan.price}`,
          align: "center",
          maxWidth: "narrow",
        }),
        createManualBlock("text", {
          role: "body",
          value: plan.description,
          align: "center",
          maxWidth: "narrow",
        }),
        createManualBlock("button", {
          label: plan.cta,
          target: { kind: "url", value: "#" },
          variant: "primary",
        }),
      );
    }
    next.children = children;
    next.layout = {
      ...next.layout,
      split: { pattern: "1-1-1", groupSize: 3, rootPosition: "above" },
    };
    return next;
  }

  return next;
}
