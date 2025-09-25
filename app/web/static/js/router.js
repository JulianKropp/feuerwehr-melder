'use strict';
(function () {
  const routes = {
    '/dashboard': 'dashboard',
    '/incidents': 'incidents',
    '/vehicles': 'vehicles',
    '/options': 'options',
  };
  const defaultPath = '/incidents';

  function pathToView(pathname) {
    return routes[pathname] || null;
  }

  function dispatchRoute(pathname) {
    const view = pathToView(pathname) || routes[defaultPath];
    const ev = new CustomEvent('route-changed', { detail: { path: pathname, view } });
    window.dispatchEvent(ev);
  }

  function navigate(pathname) {
    if (!routes[pathname]) pathname = defaultPath;
    if (window.location.pathname !== pathname) {
      window.history.pushState({}, '', pathname);
    }
    dispatchRoute(pathname);
  }

  function applyInitialRoute() {
    const current = window.location.pathname;
    if (!routes[current]) {
      // normalize to default
      window.history.replaceState({}, '', defaultPath);
      dispatchRoute(defaultPath);
    } else {
      dispatchRoute(current);
    }
  }

  window.addEventListener('popstate', () => {
    dispatchRoute(window.location.pathname);
  });

  // Expose API
  window.Router = {
    navigate,
    applyInitialRoute,
  };
})();
