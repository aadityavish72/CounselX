(function () {
  "use strict";

  window.CX = window.CX || {};
  window.CX.api = window.CX.api || {};

  const config = window.CX.config || {};

  const API_BASE_URL = String(
    config.API_BASE_URL || "http://localhost:5000/api"
  ).replace(/\/+$/, "");

  function getBaseUrl() {
    const cfg = window.CX?.config || {};
    return String(cfg.API_BASE_URL || API_BASE_URL || "http://localhost:5000/api").replace(/\/+$/, "");
  }

  const REQUEST_TIMEOUT = Number(config.REQUEST_TIMEOUT) || 15000;

  /**
   * Convert filters into a query string.
   */
  function buildQuery(params = {}) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      const normalizedValue = String(value).trim();

      if (normalizedValue !== "") {
        query.set(key, normalizedValue);
      }
    });

    return query.toString();
  }

  /**
   * Make a GET request to the CounselX backend.
   */
  async function request(path, queryParams = {}) {
    if (typeof path !== "string" || !path.trim()) {
      throw new Error("API endpoint specify nahi kiya gaya.");
    }

    const endpoint = path.replace(/^\/+/, "");
    const queryString = buildQuery(queryParams);

    const url =
      `${getBaseUrl()}/${endpoint}` +
      (queryString ? `?${queryString}` : "");

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT
    );

    try {
      let response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type") || "";
      const responseText = await response.text();

      let data = null;

      if (responseText) {
        if (contentType.includes("application/json")) {
          try {
            data = JSON.parse(responseText);
          } catch {
            throw new Error(
              `Backend ne invalid JSON return kiya (HTTP ${response.status}).`
            );
          }
        } else {
          throw new Error(
            `Backend se JSON response nahi mila (HTTP ${response.status}). ` +
            "API URL aur backend route check karo."
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
          data?.error ||
          `API request fail hui (HTTP ${response.status}).`
        );
      }

      if (data === null) {
        throw new Error("Backend ne empty response return kiya.");
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(
          "Request timeout ho gaya. Backend aur network check karo."
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          "Backend se connection nahi ho raha. Server URL, CORS aur network check karo."
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch cutoff records with filters and pagination.
   */
  async function getCutoffs(filters = {}) {
    return request("/cutoffs", filters);
  }

  /**
   * Fetch values available for cutoff filters (supports optional query constraints).
   */
  async function getCutoffFilters(queryParams = {}) {
    return request("/cutoffs/filters", queryParams);
  }

  /**
   * Fetch single cutoff record by MongoDB ID.
   */
  async function getCutoffById(id) {
    if (!id) throw new Error("Cutoff record ID required.");
    return request(`/cutoffs/${encodeURIComponent(id)}`);
  }

  /**
   * Fetch dashboard summary data.
   */
  async function getDashboardSummary() {
    return request("/dashboard/summary");
  }

  /**
   * Check the database status endpoint.
   */
  async function checkBackend() {
    return request("/db-status");
  }

  /**
   * Fetch sample cutoff records for debugging.
   */
  async function testCutoffs() {
    return request("/test-cutoffs");
  }

  /**
   * Fetch explainable student counselling recommendations.
   */
  async function getCounsellingRecommendations(profile = {}) {
    return request("/recommendations/counsel", profile);
  }

  /**
   * Fetch 4-factor advanced college recommendations.
   */
  async function getAdvancedRecommendations(profile = {}) {
    try {
      return await request("/recommendations/advanced", profile);
    } catch (err) {
      if (err.message && (err.message.includes("404") || err.message.toLowerCase().includes("not found"))) {
        return await request("/recommendations", profile);
      }
      throw err;
    }
  }

  /**
   * Fetch cutoff trajectory prediction for a specific college allotment.
   */
  async function predictCutoff(params = {}) {
    return request("/predict/cutoff", params);
  }

  /**
   * Fetch historical backtesting evaluation report.
   */
  async function getBacktestReport(trainingRound = 2) {
    return request("/predict/backtest", { trainingRound });
  }

  function get(path, queryParams = {}) {
    return request(path, queryParams);
  }

  Object.assign(window.CX.api, {
    get,
    getCutoffs,
    getCutoffFilters,
    getCutoffById,
    getDashboardSummary,
    getCounsellingRecommendations,
    getAdvancedRecommendations,
    predictCutoff,
    getBacktestReport,
    checkBackend,
    testCutoffs
  });
})();
