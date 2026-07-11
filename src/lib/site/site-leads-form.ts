import type { SiteLeadFormConfig } from "./site-leads";

export function renderSiteLeadForm(args: {
  slug: string;
  pageId: string;
  locale: string;
  config: SiteLeadFormConfig;
}): string {
  if (!args.config.enabled) return "";

  const title = args.config.title?.trim() || "Contacto";
  const submitLabel = args.config.submitLabel?.trim() || "Enviar";
  const fields = args.config.fields.length ? args.config.fields : ["name", "email", "message"];

  const inputs = fields
    .map((field) => {
      if (field === "message") {
        return `<label class="site-lead-form__field"><span>Mensaje</span><textarea name="message" rows="4" required></textarea></label>`;
      }
      if (field === "email") {
        return `<label class="site-lead-form__field"><span>Email</span><input type="email" name="email" required autocomplete="email" /></label>`;
      }
      return `<label class="site-lead-form__field"><span>Nombre</span><input type="text" name="name" required autocomplete="name" /></label>`;
    })
    .join("");

  return `<section class="site-lead-form-wrap" data-site-slug="${args.slug}" data-page-id="${args.pageId}" data-locale="${args.locale}">
  <form class="site-lead-form" data-site-lead-form="true">
    <h2 class="site-lead-form__title">${escapeHtml(title)}</h2>
    ${inputs}
    <button type="submit" class="site-btn site-btn--primary">${escapeHtml(submitLabel)}</button>
    <p class="site-lead-form__status" hidden role="status"></p>
  </form>
</section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const SITE_LEADS_FORM_JS = `
document.querySelectorAll("[data-site-lead-form]").forEach(function (form) {
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var wrap = form.closest("[data-site-slug]");
    if (!wrap) return;
    var slug = wrap.getAttribute("data-site-slug");
    var pageId = wrap.getAttribute("data-page-id") || "";
    var locale = wrap.getAttribute("data-locale") || "es";
    var status = form.querySelector(".site-lead-form__status");
    var fd = new FormData(form);
    var payload = {
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      message: String(fd.get("message") || "").trim(),
      pageId: pageId,
      locale: locale,
    };
    if (status) {
      status.hidden = false;
      status.textContent = "Enviando…";
    }
    try {
      var res = await fetch("/api/site/" + encodeURIComponent(slug) + "/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(json.error || "Error al enviar");
      form.reset();
      if (status) status.textContent = json.message || "Gracias — te responderemos pronto.";
    } catch (error) {
      if (status) status.textContent = error && error.message ? error.message : "No se pudo enviar.";
    }
  });
});
`.trim();
