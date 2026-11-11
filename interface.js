'use strict';

(() => {
  function initializeControls() {
    const root = document.documentElement;
    const themeSwitch = document.getElementById('theme');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const layout = document.getElementById('layout');
    const sidebar = document.getElementById('sidebar');
    const themeKey = 'pfmp-map-theme';

    function applyTheme(theme) {
      root.dataset.theme = theme;
      themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
      document.dispatchEvent(new Event('pfmp:themechange'));
    }

    let theme = 'light';
    try {
      if (localStorage.getItem(themeKey) === 'dark') theme = 'dark';
    } catch {
      // Le stockage peut être désactivé.
    }
    applyTheme(theme);
    themeSwitch.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      try {
        localStorage.setItem(themeKey, theme);
      } catch {
        // Le thème reste actif pour la page ouverte.
      }
    });
    themeSwitch.disabled = false;

    sidebarToggle.addEventListener('click', () => {
      const collapsed = layout.classList.toggle('sidebar-hidden');
      sidebar.hidden = collapsed;
      const label = collapsed ? 'Afficher le panneau de recherche' : 'Masquer le panneau de recherche';
      sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
      sidebarToggle.setAttribute('aria-label', label);
      sidebarToggle.title = label;
      document.dispatchEvent(new Event('pfmp:sidebarresize'));
    });
    sidebarToggle.hidden = false;
  }

  // L’état « interactive » précède l’exécution des scripts différés de la carte.
  if (document.readyState === 'loading') {
    document.addEventListener('readystatechange', initializeControls, { once: true });
  } else {
    initializeControls();
  }
})();
