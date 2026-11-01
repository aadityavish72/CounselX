// (function () {
//   "use strict";

//   window.CX = window.CX || {};

//   const config = window.CX.config;

//   async function request(path, options = {}) {
//     const controller = new AbortController();

//     const timeoutId = setTimeout(
//       () => controller.abort(),
//       config.REQUEST_TIMEOUT
//     );

//     try {
//       let response = await fetch(
//         `${config.API_BASE_URL}${path}`,
//         {
//           ...options,
//           signal: controller.signal,
//           headers: {
//             Accept: "application/json",
//             ...(options.headers || {})
//           }
//         }
//       );

//       let contentType =
//         response.headers.get("content-type") || "";

//       let data;

//       if (contentType.includes("application/json")) {
//         data = await response.json();
//       } else {
//         let text = await response.text();
//         throw new Error(
//           text || `Server returned HTTP ${response.status}`
//         );
//       }

//       if (!response.ok) {
//         throw new Error(
//           data.message ||
//           data.error ||
//           `Request failed with status ${response.status}`
//         );
//       }

//       return data;
//     } catch (error) {
//       if (error.name === "AbortError") {
//         throw new Error(
//           "Backend response mein der ho rahi hai. Server status check karo."
//         );
//       }

//       if (
//         error instanceof TypeError
//       ) {
//         throw new Error(
//           "Backend se connection nahi ho raha. Server URL aur server status check karo."
//         );
//       }

//       throw error;
//     } finally {
//       clearTimeout(timeoutId);
//     }
//   }

//   const api = {
//     get(path) {
//       return request(path);
//     },

//     post(path, body) {
//       return request(path, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json"
//         },
//         body: JSON.stringify(body)
//       });
//     },

//     checkBackend() {
//       return request("/db-status");
//     },

//     getCutoffs(filters = {}) {
//       const params = new URLSearchParams();

//       Object.entries(filters).forEach(([key, value]) => {
//         if (
//           value !== undefined &&
//           value !== null &&
//           String(value).trim() !== ""
//         ) {
//           params.set(key, String(value).trim());
//         }
//       });

//       const query = params.toString();

//       return request(
//         `/cutoffs${query ? `?${query}` : ""}`
//       );
//     },

//     getCutoffFilters() {
//       return request("/cutoffs/filters");
//     }
//   };

//   window.CX.api = api;
// })();


(function () {
  "use strict";

  // Ensure the CounselX namespace exists.
  window.CX = window.CX || {};
  window.CX.api = window.CX.api || {};

  const config = window.CX.config || {};

  const API_BASE_URL = String(
    config.API_BASE_URL || "http://localhost:5000/api"
  ).replace(/\/+$/, "");

  const REQUEST_TIMEOUT = Number(config.REQUEST_TIMEOUT) || 15000;

  /**
   * Convert filters into a query string.
   * Empty values are skipped; values such as 0 are preserved.
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

    // Pass paths such as "/cutoffs", not "/api/cutoffs".
    const endpoint = path.replace(/^\/+/, "");

    const queryString = buildQuery(queryParams);

    const url =
      `${API_BASE_URL}/${endpoint}` +
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

      const contentType =
        response.headers.get("content-type") || "";

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
   *
   * Supported query keys depend on the backend:
   * year, round, instituteType, instituteName, branch, quota,
   * seatCategory, genderPool, rankType, rank, search, page, limit.
   */
  async function getCutoffs(filters = {}) {
    return request("/cutoffs", filters);
  }

  /**
   * Fetch values available for cutoff filters.
   */
  async function getCutoffFilters() {
    return request("/cutoffs/filters");
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

  // Keep the generic GET helper for dashboard and analytics APIs.
  function get(path, queryParams = {}) {
    return request(path, queryParams);
  }

  // Preserve any other API functions already attached to CX.api.
  Object.assign(window.CX.api, {
    get,
    getCutoffs,
    getCutoffFilters,
    checkBackend,
    testCutoffs
  });
})();
