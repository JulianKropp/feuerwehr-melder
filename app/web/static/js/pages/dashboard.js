'use strict';
(function(){
  // Dashboard page module
  function onEnter() {
    // Ensure normal app chrome (header/nav) is visible when using SPA dashboard
    // Fullscreen should only be applied by the standalone /dashboard page (dashboard.html)
    document.body.classList.remove('dashboard-fullscreen');
    // Give the layout a tick to settle, then trigger a resize so Leaflet adjusts
    setTimeout(() => {
      try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    }, 50);
  }

  function onLeave() {
    document.body.classList.remove('dashboard-fullscreen');
  }

  window.addEventListener('route-changed', (e) => {
    const view = (e.detail || {}).view;
    if (view === 'dashboard') onEnter();
    else onLeave();
  });

  // Safety: ensure class removed on unload/navigation away
  window.addEventListener('beforeunload', onLeave);
})();
