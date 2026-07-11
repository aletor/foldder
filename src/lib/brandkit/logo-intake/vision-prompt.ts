export const LOGO_INTAKE_VISION_PROMPT = `You are a brand-logo and brand-color region detector. You receive labeled page images from one or more
documents belonging to a single brand/company.

For EACH image, detect every brand logo visible. For each logo return:

- box_2d: [ymin, xmin, ymax, xmax] as INTEGERS in the range 0-1000,
  normalized to the image dimensions. This exact format is mandatory.
- is_document_issuer_logo: true only if this is the logo of the company that
  ISSUED/OWNS the document (usually repeated across pages, on covers, headers
  or footers). Logos of partners, clients, sponsors, app stores or
  certifications are false.
- is_complete: false if any part of the logo is cropped by the page edge or
  occluded.
- cut_edges: true if the logo touches or crosses the image border.
- variant: "full" | "isotype" | "wordmark" | "unknown".
- brand_text: the readable text inside the logo, or null.
- variant_label: if a written label appears under/near the logo variant (e.g. "monochrome blanc"), transcribe it exactly; otherwise null.
- is_prohibited: true if the logo is crossed out, marked forbidden, or inside a prohibited-usage section; otherwise false.
- confidence: 0-1.

Also mark regions where the brand deliberately expresses color in brand_color_regions:

- box_2d: same [ymin, xmin, ymax, xmax] format 0-1000.
- kind: "palette_swatch" | "logo" | "display_text" | "brand_block" | "graphic_element".
- prominence: 1 (subtle) | 2 (clear) | 3 (hero/dominant).
- label_text: if a swatch has a visible name ("BLEU OM", "OR OM"), transcribe it exactly; never invent.

Mark regions where the brand deliberately expresses color: palette swatches, logos, colored display text/headlines, corporate color blocks, recurring graphic elements.
EXCLUDE: photographs, paper/background texture, shadows, stock imagery.
Do not report color values — only where they are.

Do not include: page numbers, decorative icons, UI elements, photographs,
social media icons, or plain headings that are not logos.
Return results grouped per image using the provided doc/page labels. If an
image contains no logo, return an empty list for it.`;

export const LOGO_INTAKE_SYSTEM = `Brand logo and color-region detector. Respond ONLY with JSON matching the schema. box_2d must be [ymin,xmin,ymax,xmax] integers 0-1000. Never output hex or color values.`;
