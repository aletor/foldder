/** Rutas /api del cliente que cuentan como «petición IA» (HUD + guardián). */

export function getAiRequestLabelForPathname(pathname: string): string | null {
  if (pathname === "/api/usage") return null;
  if (pathname === "/api/spaces") return null;

  const rules: { test: RegExp; label: string }[] = [
    { test: /^\/api\/gemini\/generate$/, label: "Image Creation" },
    { test: /^\/api\/gemini\/generate-stream$/, label: "Image Creation" },
    { test: /^\/api\/openai\/generate-stream$/, label: "ChatGPT Images" },
    { test: /^\/api\/gemini\/video$/, label: "Veo" },
    { test: /^\/api\/gemini\/analyze-correction$/, label: "Gemini" },
    { test: /^\/api\/gemini\/describe-region$/, label: "Gemini" },
    { test: /^\/api\/seedance\/video$/, label: "Seedance" },
    { test: /^\/api\/gemini\/analyze-areas$/, label: "Gemini" },
    { test: /^\/api\/openai\/enhance$/, label: "OpenAI" },
    { test: /^\/api\/spaces\/assistant$/, label: "Asistente" },
    { test: /^\/api\/spaces\/brandKit\/crawl$/, label: "BrandKit" },
    { test: /^\/api\/spaces\/brandKit\/ingest$/, label: "BrandKit" },
    { test: /^\/api\/spaces\/brandKit\/gallery\/generate$/, label: "BrandKit" },
    { test: /^\/api\/spaces\/text-content$/, label: "Texto" },
    { test: /^\/api\/spaces\/guionista$/, label: "Guionista" },
    { test: /^\/api\/spaces\/cine\/analyze$/, label: "Cine" },
    { test: /^\/api\/spaces\/describe$/, label: "OpenAI" },
    { test: /^\/api\/grok\/generate$/, label: "Grok" },
    { test: /^\/api\/grok\/status\//, label: "Grok" },
    { test: /^\/api\/runway\/generate$/, label: "Runway" },
    { test: /^\/api\/runway\/status\//, label: "Runway" },
    { test: /^\/api\/spaces\/matte$/, label: "Replicate" },
    { test: /^\/api\/spaces\/video-matte$/, label: "Replicate" },
    { test: /^\/api\/spaces\/compose$/, label: "Componer" },
    { test: /^\/api\/spaces\/search$/, label: "Búsqueda" },
    { test: /^\/api\/video-editor\/render$/, label: "Render" },
    { test: /^\/api\/video-editor\/subtitles\/transcribe$/, label: "Subtítulos" },
    { test: /^\/api\/spaces\/brandKit\/ingest$/, label: "BrandKit" },
    { test: /^\/api\/spaces\/brandKit\/visual\/generate$/, label: "BrandKit" },
    { test: /^\/api\/spaces\/brandKit\/logo\/vectorize$/, label: "BrandKit" },
    { test: /^\/api\/inspiration\/search$/, label: "Inspiration" },
  ];

  for (const { test, label } of rules) {
    if (test.test(pathname)) return label;
  }
  return null;
}
