'use strict';
(function(){
  // Dashboard page module
  function onEnter() {
    // Enable fullscreen dashboard mode (hide header/nav, expand content)
    document.body.classList.add('dashboard-fullscreen');
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
