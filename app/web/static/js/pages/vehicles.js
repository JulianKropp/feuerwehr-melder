'use strict';
(function(){
  // Vehicles page module
  function onEnter() {
    // Placeholder for vehicles-specific initialization
  }

  window.addEventListener('route-changed', (e) => {
    if ((e.detail || {}).view === 'vehicles') {
      onEnter();
    }
  });
})();
