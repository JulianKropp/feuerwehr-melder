'use strict';
(function(){
  // Options page module
  function onEnter() {
    // Placeholder for options-specific initialization
  }

  window.addEventListener('route-changed', (e) => {
    if ((e.detail || {}).view === 'options') {
      onEnter();
    }
  });
})();
