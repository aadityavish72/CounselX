(function () {
  "use strict";

  window.CX = window.CX || {};

  const api = window.CX.api;
  const charts = window.CX.charts;
  const utils = window.CX.utils;
  const store = window.CX.store;

  const $ = (id) => document.getElementById(id);

  function populateSelect(id, items, defaultText = "Select…") {
    const el = $(id);
    if (!el) return;
    const cur = el.value;
    let html = `<option value="">${defaultText}</option>`;
    items.forEach((item) => {
      html += `<option value="${utils.escapeHTML(item)}">${utils.escapeHTML(item)}</option>`;
    });
    el.innerHTML = html;
    if (cur) el.value = cur;
  }

  async function loadAnalyticsOptions() {
    try {
      const res = await api.getCutoffFilters();
      if (!res || !res.success || !res.filters) return;
      const f = res.filters;

      populateSelect("an-seatCategory", f.seatCategories || ["OPEN"], "All categories");
      populateSelect("an-quota", f.quotas || ["AI"], "All quotas");
      populateSelect("an-genderPool", f.genderPools || ["Gender-Neutral"], "All gender pools");
      populateSelect("an-rankType", f.rankTypes || ["CRL"], "All rank types");
      populateSelect("an-year", f.years || [2026], "All years");

      const roundEl = $("an-round");
      if (roundEl && f.rounds) {
        let html = '<option value="">All rounds</option>';
        f.rounds.forEach((r) => {
          html += `<option value="${r}">Round ${r}</option>`;
        });
        roundEl.innerHTML = html;
      }

      if (f.institutes) {
        const dl = $("dl-an-institute");
        if (dl) {
          dl.innerHTML = f.institutes
            .map((inst) => `<option value="${utils.escapeHTML(inst)}"></option>`)
            .join("");
        }
        if (!$("an-institute").value && f.institutes[0]) {
          $("an-institute").value = f.institutes[0];
        }
      }

      // Auto-select text on click/focus so user can immediately type to search all 55+ colleges
      const instEl = $("an-institute");
      if (instEl && !instEl.dataset.hasSelectHandler) {
        instEl.dataset.hasSelectHandler = "true";
        instEl.addEventListener("focus", function () { this.select(); });
        instEl.addEventListener("click", function () { this.select(); });
      }

      const branchEl = $("an-branch");
      if (branchEl && !branchEl.dataset.hasSelectHandler) {
        branchEl.dataset.hasSelectHandler = "true";
        branchEl.addEventListener("focus", function () { this.select(); });
        branchEl.addEventListener("click", function () { this.select(); });
      }

      if (f.branches) {
        const dl = $("dl-an-branch");
        if (dl) {
          dl.innerHTML = f.branches
            .map((b) => `<option value="${utils.escapeHTML(b)}"></option>`)
            .join("");
        }
        if (!$("an-branch").value && f.branches[0]) {
          $("an-branch").value = f.branches[0];
        }
      }

      // Default selections if not set
      if (!$("an-seatCategory").value) $("an-seatCategory").value = "OPEN";
      if (!$("an-quota").value) $("an-quota").value = "AI";
      if (!$("an-genderPool").value) $("an-genderPool").value = "Gender-Neutral";
      if (!$("an-rankType").value) $("an-rankType").value = "CRL";
      if (!$("an-round").value) $("an-round").value = "1";
    } catch (err) {
      console.warn("Could not load analytics filters:", err);
    }
  }

  async function loadAnalytics() {
    const status = $("analytics-status");
    if (status) status.textContent = "Loading analytics from backend…";

    const institute = $("an-institute")?.value.trim() || "";
    const branch = $("an-branch")?.value.trim() || "";
    const seatCategory = $("an-seatCategory")?.value || "";
    const quota = $("an-quota")?.value || "";
    const genderPool = $("an-genderPool")?.value || "";
    const rankType = $("an-rankType")?.value || "";
    const year = $("an-year")?.value || "";
    const round = $("an-round")?.value || "";

    try {
      // 1. Fetch round-wise progression for the selected institute and programme
      const roundQuery = {
        instituteName: institute,
        branch,
        seatCategory,
        quota,
        genderPool,
        rankType,
        year: year || 2026,
        limit: 50
      };

      const roundRes = await api.getCutoffs(roundQuery);
      const roundRecords = roundRes?.data || [];

      if (roundRecords.length) {
        // Sort by round
        roundRecords.sort((a, b) => Number(a.round) - Number(b.round));
        const roundLabels = roundRecords.map((r) => `Round ${r.round}`);
        const roundOpenings = roundRecords.map((r) => Number(r.openingRank));
        const roundClosings = roundRecords.map((r) => Number(r.closingRank));

        charts.draw("cc-round", "line", roundLabels, [
          { label: "Opening Rank", data: roundOpenings, color: "#14b8a6" },
          { label: "Closing Rank", data: roundClosings, color: "#4f46e5" }
        ], { reverseRank: true });

        charts.draw("cc-openclose", "bar", roundLabels, [
          { label: "Opening Rank", data: roundOpenings, color: "#14b8a6" },
          { label: "Closing Rank", data: roundClosings, color: "#7c3aed" }
        ], { reverseRank: true });
      } else {
        const ccRound = $("cc-round");
        if (ccRound) charts.empty(ccRound, "No round data found for this selection.");
        const ccOpenClose = $("cc-openclose");
        if (ccOpenClose) charts.empty(ccOpenClose, "No opening/closing data found for this selection.");
      }

      // 2. Fetch institute comparison for the same programme and parameters
      const instQuery = {
        branch,
        seatCategory,
        quota,
        genderPool,
        rankType,
        year: year || 2026,
        round: round || 1,
        limit: 12
      };

      const instRes = await api.getCutoffs(instQuery);
      const instRecords = instRes?.data || [];

      if (instRecords.length) {
        // Sort by closing rank
        instRecords.sort((a, b) => Number(a.closingRank) - Number(b.closingRank));
        const instLabels = instRecords.map((r) => {
          const name = r.instituteName || r.institute || "";
          return name.replace("Indian Institute of Technology", "IIT").replace("National Institute of Technology", "NIT");
        });
        const instClosings = instRecords.map((r) => Number(r.closingRank));

        charts.draw("cc-institutes", "bar", instLabels, [
          { label: "Closing Rank", data: instClosings, color: "#4f46e5" }
        ], { horizontal: true, reverseRank: false });
      } else {
        const ccInst = $("cc-institutes");
        if (ccInst) charts.empty(ccInst, "No comparative institute records found.");
      }

      // 3. Year-wise single card
      if (roundRecords.length) {
        charts.draw("cc-year", "line", ["2026"], [
          { label: "Closing Rank", data: [Number(roundRecords[0].closingRank)], color: "#4f46e5" }
        ], { reverseRank: true });
      } else {
        const ccYear = $("cc-year");
        if (ccYear) charts.empty(ccYear, "No year data available.");
      }

      if (status) status.textContent = `Analytics loaded for ${institute || "selection"}.`;
    } catch (err) {
      console.error("Analytics load error:", err);
      if (status) status.textContent = `Could not load analytics: ${err.message}`;
    }
  }

  function init() {
    loadAnalyticsOptions();

    $("analytics-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      loadAnalytics();
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  window.CX.analytics = {
    load: loadAnalytics
  };
})();
