/** Rutas /api del cliente que cuentan como «petición IA» (HUD + guardián). */

export function getAiRequestLabelForPathname(pathname: string): string | null {
  if (pathname === "/api/usage") return null;
  if (pathname === "/api/spaces") return null;

  const rules: { test: RegExp; label: string }[] = [
    { test: /^\/api\/gemini\/generate$/, label: "Nano Banana" },
    { test: /^\/api\/gemini\/generate-stream$/, label: "Nano Banana" },
    { test: /^\/api\/gemini\/video$/, label: "Veo" },
    { test: /^\/api\/seedance\/video$/, label: "Seedance" },
    { test: /^\/api\/gemini\/analyze-areas$/, label: "Gemini" },
    { test: /^\/api\/openai\/enhance$/, label: "OpenAI" },
    { test: /^\/api\/spaces\/assistant$/, label: "Asistente" },
    { test: /^\/api\/spaces\/guionista$/, label: "Guionista" },
    { test: /^\/api\/spaces\/describe$/, label: "OpenAI" },
    { test: /^\/api\/grok\/generate$/, label: "Grok" },
    { test: /^\/api\/grok\/status\//, label: "Grok" },
    { test: /^\/api\/runway\/generate$/, label: "Runway" },
    { test: /^\/api\/runway\/status\//, label: "Runway" },
    { test: /^\/api\/runway\/upload$/, label: "Runway" },
    { test: /^\/api\/spaces\/matte$/, label: "Replicate" },
    { test: /^\/api\/spaces\/video-matte$/, label: "Replicate" },
    { test: /^\/api\/spaces\/compose$/, label: "Componer" },
    { test: /^\/api\/spaces\/search$/, label: "Búsqueda" },
    { test: /^\/api\/pinterest\/search$/, label: "Pinterest" },
  ];

  for (const { test, label } of rules) {
    if (test.test(pathname)) return label;
  }
  return null;
}
