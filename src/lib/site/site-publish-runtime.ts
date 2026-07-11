/** JS mínimo embebido en sitios publicados (carousel + appear on scroll). */
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
`.trim();
