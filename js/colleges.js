
(function () {
  "use strict";

  window.CX = window.CX || {};

  const api = window.CX.api;
  const config = window.CX.config;

  let state = {
    page: 1,
    limit: 20,
    total: 0,
    filters: {},
    records: [],
    loading: false,
    hasSearched: false
  };

  const $ = (id) => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-IN") : "—";
  }

  function getField(record, names) {
    for (const name of names) {
      if (record && record[name] !== undefined &&
          record[name] !== null && record[name] !== "") {
        return record[name];
      }
    }
    return "—";
  }

  // Supports common response shapes:
  // [ ... ], { data: [...] }, { results: [...] }, { items: [...] }
  function normalizeResponse(response) {
    if (Array.isArray(response)) {
      return {
        records: response,
        total: response.length
      };
    }

    const records =
      response?.data ??
      response?.results ??
      response?.items ??
      response?.cutoffs ??
      response?.records ??
      [];

    const safeRecords = Array.isArray(records) ? records : [];

    const totalValue =
      response?.total ??
      response?.totalCount ??
      response?.totalRecords ??
      response?.pagination?.total ??
      safeRecords.length;

    const parsedTotal = Number(totalValue);

    return {
      records: safeRecords,
      total: Number.isFinite(parsedTotal)
        ? parsedTotal
        : safeRecords.length
    };
  }

  function collectFilters() {
    return {
      search: $("ex-search")?.value.trim() || "",
      instituteName: $("ex-instituteName")?.value.trim() || "",
      branch: $("ex-branch")?.value.trim() || "",
      instituteType: $("ex-instituteType")?.value || "",
      year: $("ex-year")?.value || "",
      round: $("ex-round")?.value || "",
      quota: $("ex-quota")?.value || "",
      seatCategory: $("ex-seatCategory")?.value || "",
      genderPool: $("ex-genderPool")?.value || "",
      rankType: $("ex-rankType")?.value || "",
      rank: $("ex-rank")?.value || "",
      page: state.page,
      limit: state.limit
    };
  }

  function setStatus(message) {
    const el = $("ex-count");
    if (el) el.textContent = message;
  }

  function showError(message) {
    const errorBox = $("explore-load-error");

    if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }
  }

  function clearError() {
    const errorBox = $("explore-load-error");

    if (errorBox) {
      errorBox.textContent = "";
      errorBox.hidden = true;
    }
  }

  function showLoading() {
    const results = $("ex-results");

    if (results) {
      results.innerHTML =
        '<div class="card" role="status">Loading cutoff records…</div>';
    }

    setStatus("Fetching records from CounselX backend…");
  }

  function renderEmpty(message) {
    const results = $("ex-results");

    if (results) {
      results.innerHTML =
        `<div class="card">${escapeHTML(message)}</div>`;
    }
  } 
  
  function classifyHistoricalCutoff(studentRank, closingRank) {
  const rank = Number(studentRank);
  const cutoff = Number(closingRank);

  if (
    !Number.isFinite(rank) ||
    !Number.isFinite(cutoff) ||
    rank <= 0 ||
    cutoff <= 0
  ) {
    return "Insufficient data";
  }

  if (rank <= cutoff * 0.8) {
    return "Safer historical range";
  }

  if (rank <= cutoff) {
    return "Target historical range";
  }

  return "Reach historical range";
}
  window.classifyHistoricalCutoff = classifyHistoricalCutoff;

  function renderTable(records) {
    const container = $("ex-results");
    if (!container) return;

    if (!records.length) {
      renderEmpty("No matching cutoff records found. Try changing your filters.");
      return;
    }

    const rows = records.map((record) => {
      const institute = getField(record, [
        "instituteName", "institute", "collegeName"
      ]);

      const program = getField(record, [
        "academicProgram", "programName", "branch", "program"
      ]);

      const year = getField(record, ["year"]);
      const round = getField(record, ["round", "roundNo"]);
      const type = getField(record, ["instituteType"]);
      const quota = getField(record, ["quota"]);
      const category = getField(record, [
        "seatCategory", "category", "seatType"
      ]);
      const gender = getField(record, ["genderPool", "gender"]);
      const rankType = getField(record, ["rankType"]);
      const opening = getField(record, ["openingRank", "opening"]);
      const closing = getField(record, ["closingRank", "closing"]);
      const studentRank = state.filters.rank;
      const status = window.classifyHistoricalCutoff(studentRank, closing);

      return `
        <tr>
          <td>${escapeHTML(institute)}</td>
          <td>${escapeHTML(program)}</td>
          <td>${escapeHTML(year)}</td>
          <td>${escapeHTML(round)}</td>
          <td>${escapeHTML(type)}</td>
          <td>${escapeHTML(status)}</td>
          <td>${escapeHTML(quota)}</td>
          <td>${escapeHTML(category)}</td>
          <td>${escapeHTML(gender)}</td>
          <td>${escapeHTML(rankType)}</td>
          <td>${escapeHTML(formatNumber(opening))}</td>
          <td>${escapeHTML(formatNumber(closing))}</td>
        </tr>`;
    }).join("");

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Institute</th>
              <th>Programme</th>
              <th>Year</th>
              <th>Round</th>
              <th>Type</th>
              <th>Status</th>
              <th>Quota</th>
              <th>Category</th>
              <th>Gender pool</th>
              <th>Rank type</th>
              <th>Opening rank</th>
              <th>Closing rank</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderPagination() {
    const container = $("ex-pagination");
    if (!container) return;

    const totalPages = Math.max(
      1,
      Math.ceil(state.total / state.limit)
    );

    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `
      <button type="button" class="btn btn-secondary"
        data-page="${state.page - 1}"
        ${state.page <= 1 ? "disabled" : ""}>
        Previous
      </button>
      <span>Page ${state.page} of ${totalPages}</span>
      <button type="button" class="btn btn-secondary"
        data-page="${state.page + 1}"
        ${state.page >= totalPages ? "disabled" : ""}>
        Next
      </button>
    `;
  }

  function sortCurrentPage(records) {
    const sort = $("ex-sort")?.value;
    const sorted = [...records];

    const sortOptions = {
      "closing-asc": ["closingRank", 1],
      "closing-desc": ["closingRank", -1],
      "opening-asc": ["openingRank", 1],
      "opening-desc": ["openingRank", -1]
    };

    const option = sortOptions[sort];
    if (!option) return sorted;

    const [field, direction] = option;

    return sorted.sort((a, b) => {
      const av = Number(a[field]);
      const bv = Number(b[field]);

      if (!Number.isFinite(av) || !Number.isFinite(bv)) return 0;
      return (av - bv) * direction;
    });
  }

  async function loadCutoffs() {
    if (!api || typeof api.getCutoffs !== "function") {
      showError("CX.api.getCutoffs() available nahi hai. js/api.js check karo.");
      return;
    }

    state.loading = true;
    clearError();
    showLoading();

    try {
      let response = await window.CX.api.getCutoffs(collectFilters());
      let normalized = normalizeResponse(response);

      state.records = normalized.records;
      state.total = normalized.total;
      state.hasSearched = true;

      renderTable(sortCurrentPage(state.records));
      renderPagination();

      setStatus(
        `${state.total.toLocaleString("en-IN")} matching record(s)`
      );
    } catch (error) {
      console.error("Cutoff API error:", error);
      renderEmpty("Cutoff records load nahi ho sake.");
      showError(error.message || "Unexpected API error.");
      setStatus("Could not load cutoff records.");
    } finally {
      state.loading = false;
    }
  }

  function resetFilters() {
    const ids = [
      "ex-search", "ex-instituteName", "ex-branch",
      "ex-instituteType", "ex-year", "ex-round", "ex-quota",
      "ex-seatCategory", "ex-genderPool", "ex-rankType", "ex-rank"
    ];

    ids.forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });

    state.page = 1;
    state.filters = {};
    loadCutoffs();
  }

  function init() {
    const form = $("explore-form");
    const resetButton = $("ex-reset");
    const pagination = $("ex-pagination");
    const sort = $("ex-sort");
    const limit = $("ex-limit");
    const useProfile = $("ex-use-profile");

    if (!form || ! $("ex-results")) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      state.page = 1;
      state.filters = collectFilters();
      loadCutoffs();
    });

    resetButton?.addEventListener("click", resetFilters);

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;

      const nextPage = Number(button.dataset.page);
      if (!Number.isInteger(nextPage) || nextPage < 1) return;

      state.page = nextPage;
      loadCutoffs();
    });

    sort?.addEventListener("change", () => {
      if (state.hasSearched) {
        renderTable(sortCurrentPage(state.records));
      }
    });

    limit?.addEventListener("change", () => {
      const value = Number(limit.value);

      if (![10, 20, 50].includes(value)) return;

      state.limit = value;
      state.page = 1;

      if (state.hasSearched) loadCutoffs();
    });

    useProfile?.addEventListener("click", () => {
      // Profile integration will be connected after verifying
      // the actual profile storage structure.
      window.location.hash = "#/profile";
    });

    setStatus("Choose filters and click Search.");
  }

  document.addEventListener("DOMContentLoaded", init);

  window.CX.colleges = {
    loadCutoffs,
    resetFilters,
    getState: () => ({ ...state })
  };
})();
