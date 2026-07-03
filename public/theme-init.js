// Applies the persisted (or system-preferred) theme before first paint to
// avoid a light/dark flash. Kept as an external, same-origin script so the CSP
// can drop script-src 'unsafe-inline'. Mirrors ThemeService's storage key.
(function () {
  try {
    var v = localStorage.getItem('dea.theme');
    var light =
      v === 'light' ||
      (!v && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    if (light) document.documentElement.classList.add('theme-light');
  } catch (e) {}
})();
