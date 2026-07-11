import { SITE_LEADS_FORM_JS } from "./site-leads-form";

export { SITE_LEADS_FORM_JS };

/** JS embebido: expandir colecciones con overflow truncate_more. */
export const SITE_COLLECTION_OVERFLOW_JS = `
document.querySelectorAll(".site-collection__more-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var root = btn.closest(".site-collection");
    var hidden = root && root.querySelector(".site-collection__overflow-items");
    if (!root || !hidden) return;
    var view = root.getAttribute("data-view");
    if (view === "table") {
      var tbody = root.querySelector(".site-collection__table tbody");
      if (tbody) tbody.insertAdjacentHTML("beforeend", hidden.innerHTML);
    } else if (view === "carousel") {
      var track = root.querySelector(".site-collection__carousel-track");
      if (track) track.insertAdjacentHTML("beforeend", hidden.innerHTML);
    } else if (view === "marquee") {
      var marquee = root.querySelector(".site-collection__marquee-track");
      if (marquee) {
        var chunk = hidden.innerHTML;
        marquee.insertAdjacentHTML("beforeend", chunk + chunk);
      }
    } else {
      var overflow = root.querySelector(".site-collection__overflow");
      if (overflow) overflow.insertAdjacentHTML("beforebegin", hidden.innerHTML);
    }
    hidden.remove();
    var wrap = btn.closest(".site-collection__overflow");
    if (wrap) wrap.remove();
  });
});
`.trim();

/** JS mínimo embebido en sitios publicados (carousel + appear on scroll + overflow). */
export const SITE_PUBLISH_RUNTIME_JS = `
(function () {
  var carousels = document.querySelectorAll(".site-collection--carousel");
  carousels.forEach(function (root) {
    var track = root.querySelector(".site-collection__carousel-track");
    if (!track) return;
    var controls = root.getAttribute("data-controls") || "dots";
    if (controls === "none") return;
    var items = track.querySelectorAll(".site-collection__item");
    if (items.length < 2) return;
    if (controls === "arrows" || controls === "both") {
      var prev = document.createElement("button");
      prev.type = "button";
      prev.className = "site-collection__nav site-collection__nav--prev";
      prev.setAttribute("aria-label", "Anterior");
      prev.textContent = "‹";
      var next = document.createElement("button");
      next.type = "button";
      next.className = "site-collection__nav site-collection__nav--next";
      next.setAttribute("aria-label", "Siguiente");
      next.textContent = "›";
      var scrollBy = function (dir) {
        var width = items[0].getBoundingClientRect().width || 280;
        track.scrollBy({ left: dir * width * 0.9, behavior: "smooth" });
      };
      prev.addEventListener("click", function () { scrollBy(-1); });
      next.addEventListener("click", function () { scrollBy(1); });
      root.appendChild(prev);
      root.appendChild(next);
    }
    if (root.getAttribute("data-autoplay") === "true") {
      var index = 0;
      window.setInterval(function () {
        index = (index + 1) % items.length;
        items[index].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      }, 5000);
    }
  });

  if ("IntersectionObserver" in window) {
    var appear = document.querySelectorAll(".site-section--motion-trigger-scroll, .site-section--motion-trigger-appear");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.12 });
    appear.forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".site-section--motion-trigger-scroll, .site-section--motion-trigger-appear").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }
})();
${SITE_COLLECTION_OVERFLOW_JS}
`.trim();

/** Runtime completo para HTML publicado (incluye captura de leads si hay formulario). */
export const SITE_PUBLISH_FULL_RUNTIME_JS = `${SITE_PUBLISH_RUNTIME_JS}
${SITE_LEADS_FORM_JS}`.trim();
