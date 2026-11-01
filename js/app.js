(function () {
  "use strict";

  window.CX = window.CX || {};

  async function updateBackendStatus() {
    const badge = document.getElementById("backend-status");
    const text = document.getElementById("backend-status-text");

    if (!badge || !text) {
      return;
    }

    badge.dataset.state = "checking";
    text.textContent = "Checking backend…";

    try {
      const result = await window.CX.api.checkBackend();

      badge.dataset.state = "connected";
      text.textContent = "Backend connected";

      console.log("Backend status:", result);
    } catch (error) {
      badge.dataset.state = "error";
      text.textContent = "Backend unavailable";

      console.error("Backend connection error:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    updateBackendStatus();
  });
  
//   function classifyHistoricalCutoff(studentRank, closingRank) {
//   const rank = Number(studentRank);
//   const cutoff = Number(closingRank);

//   if (
//     !Number.isFinite(rank) ||
//     !Number.isFinite(cutoff) ||
//     rank <= 0 ||
//     cutoff <= 0
//   ) {
//     return "Insufficient data";
//   }

//   if (rank <= cutoff * 0.8) {
//     return "Safer historical range";
//   }

//   if (rank <= cutoff) {
//     return "Target historical range";
//   }

//   return "Reach historical range";
// }
//   window.classifyHistoricalCutoff = classifyHistoricalCutoff;

  window.CX.app = {
    updateBackendStatus
  };
})();