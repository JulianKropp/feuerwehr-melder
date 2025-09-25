'use strict';
(function(){
  // Incidents page module
  function onEnter() {
    // Placeholder: extra logic when entering incidents
    // e.g., focus create button or refresh list if needed
    // const btn = document.getElementById('create-incident-btn');
    // if (btn) btn.focus();
  }

  window.addEventListener('route-changed', (e) => {
    if ((e.detail || {}).view === 'incidents') {
      onEnter();
    }
  });
})();
