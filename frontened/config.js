(function () {
  "use strict";

  window.CX = window.CX || {};

  function detectApiBaseUrl() {
    if (typeof window !== "undefined" && window.location && window.location.protocol.startsWith("http")) {
      const port = window.location.port;

      // If served via static-only dev servers (e.g. VS Code Live Server 5500-5505, Vite 5173, CRA 3000, etc.),
      // redirect API calls to local backend on port 5000
      if (
        port === "5500" ||
        port === "5501" ||
        port === "5502" ||
        port === "5503" ||
        port === "3000" ||
        port === "5173" ||
        port === "8080"
      ) {
        return "http://localhost:5000/api";
      }

      // If served directly by backend (e.g. port 5000 or custom port like 5005) or production origin
      return window.location.origin + "/api";
    }
    return "http://localhost:5000/api";
  }

  window.CX.config = {
    API_BASE_URL: detectApiBaseUrl(),
    REQUEST_TIMEOUT: 15000,
    DEFAULT_PAGE_SIZE: 20
  };
})();
