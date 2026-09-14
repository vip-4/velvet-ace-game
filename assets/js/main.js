/* Velvet Ace — shared site behavior: nav highlight, reveal-on-scroll */
(() => {
  "use strict";
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // active nav link
  const here = location.pathname.split("/").pop() || "index.html";
  $$("nav.site a").forEach(a => {
    const href = (a.getAttribute("href") || "").split("/").pop();
    if (href === here) a.setAttribute("aria-current", "page");
  });

  // reveal on scroll
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        });
      }, { threshold: 0.12 })
    : null;
  $$(".reveal").forEach(el => io ? io.observe(el) : el.classList.add("in"));
})();
