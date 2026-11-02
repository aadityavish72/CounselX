(function () {
  "use strict";

  window.CX = window.CX || {};

  const api = window.CX.api;
  const store = window.CX.store;
  const utils = window.CX.utils;

  let state = {
    page: 1,
    limit: 20,
    total: 0,
    filters: {},
    records: [],
    loading: false,
    hasSearched: false,
    sort: ""
  };

  const $ = (id) => document.getElementById(id);

  function escapeHTML(value) {
    return utils ? utils.escapeHTML(value) : String(value ?? "");
  }

  function formatNumber(value) {
    return utils ? utils.formatNumber(value) : String(value ?? "—");
  }

  function getField(record, names) {
    for (const name of names) {
      if (
        record &&
        record[name] !== undefined &&
        record[name] !== null &&
        record[name] !== ""
      ) {
        return record[name];
      }
    }
    return "—";
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
    const rankError = $("ex-rank-error");
    if (rankError) {
      rankError.textContent = "";
    }
    $("ex-rank")?.removeAttribute("aria-invalid");
  }

  function showLoading() {
    const results = $("ex-results");
    if (results) {
      results.innerHTML = `
        <div class="empty-state">
          <div class="skeleton skel-row" style="width: 100%;"></div>
          <div class="skeleton skel-row" style="width: 100%;"></div>
          <div class="skeleton skel-row" style="width: 100%;"></div>
          <p>Loading cutoff records from CounselX database…</p>
        </div>
      `;
    }
    setStatus("Fetching records from CounselX database…");
  }

  function renderEmpty(message) {
    const results = $("ex-results");
    if (results) {
      results.innerHTML = `
        <div class="empty-state">
          <h3>No matching cutoff records found</h3>
          <p>${escapeHTML(message)}</p>
          <button type="button" class="btn btn-secondary btn-sm" id="empty-reset-btn">Reset all filters</button>
        </div>
      `;
      $("empty-reset-btn")?.addEventListener("click", resetFilters);
    }
    setStatus("0 records found.");
  }

  // Populate dynamic filter options from backend (with optional contextual query constraints)
  async function loadFilterOptions(context = {}) {
    try {
      const res = await api.getCutoffFilters(context);
      if (!res || !res.success || !res.filters) return;

      const f = res.filters;

      function populateSelect(id, list, placeholder) {
        const el = $(id);
        if (!el) return;
        const currentVal = el.value;
        let html = `<option value="">${placeholder}</option>`;
        list.forEach((item) => {
          html += `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`;
        });
        el.innerHTML = html;
        if (currentVal && list.includes(currentVal)) {
          el.value = currentVal;
        }
      }

      function populateDatalist(id, list) {
        const el = $(id);
        if (!el) return;
        let html = "";
        list.forEach((item) => {
          html += `<option value="${escapeHTML(item)}"></option>`;
        });
        el.innerHTML = html;
      }

      // If context is empty, populate global dropdowns
      if (!Object.keys(context).length) {
        if (f.years) populateSelect("ex-year", f.years, "All years");
        if (f.rounds) {
          const el = $("ex-round");
          if (el) {
            const currentVal = el.value;
            let html = '<option value="">All rounds</option>';
            f.rounds.forEach((r) => {
              html += `<option value="${r}">Round ${r}</option>`;
            });
            el.innerHTML = html;
            if (currentVal) el.value = currentVal;
          }
        }
        if (f.instituteTypes) populateSelect("ex-instituteType", f.instituteTypes, "All types");
        if (f.quotas) populateSelect("ex-quota", f.quotas, "All quotas");
        if (f.seatCategories) populateSelect("ex-seatCategory", f.seatCategories, "All categories");
        if (f.genderPools) populateSelect("ex-genderPool", f.genderPools, "All gender pools");
        if (f.rankTypes) populateSelect("ex-rankType", f.rankTypes, "All rank types");
      }

      // Always update datalists based on context (e.g. only IITs if instituteType=IIT)
      if (f.institutes) populateDatalist("dl-institute", f.institutes);
      if (f.branches) populateDatalist("dl-ex-branch", f.branches);
    } catch (err) {
      console.warn("Could not load cutoff filter options from backend:", err);
    }
  }

  let lastSelectedInstituteType = "";

  function updateDynamicRankUI() {
    const instTypeEl = $("ex-instituteType");
    const rankLabel = $("ex-rank-label");
    const rankHint = $("ex-rank-hint");
    const rankInput = $("ex-rank");
    const alertBox = $("ex-exam-alert");

    const instType = (instTypeEl?.value || "").trim().toUpperCase();
    const currentRank = rankInput?.value.trim() || "";

    // Show warning if user changed institute type with an entered rank
    if (currentRank && lastSelectedInstituteType && lastSelectedInstituteType !== instType) {
      const prevExam = lastSelectedInstituteType === "IIT" ? "JEE Advanced" : "JEE Main";
      const nextExam = instType === "IIT" ? "JEE Advanced" : (instType ? "JEE Main" : "Unspecified");
      if (alertBox && prevExam !== nextExam) {
        alertBox.textContent = `Notice: You changed institute type from ${lastSelectedInstituteType} to ${instType || "All"}. IIT seat allocation requires a JEE Advanced rank, whereas NIT, IIIT, and GFTI require a JEE Main rank. Please verify your entered rank.`;
        alertBox.hidden = false;
      }
    } else if (alertBox && !currentRank) {
      alertBox.hidden = true;
    }

    if (instType === "IIT") {
      if (rankLabel) rankLabel.textContent = "JEE Advanced Rank";
      if (rankHint) rankHint.textContent = "Enter your JEE Advanced rank to explore IIT cutoffs.";
      if (rankInput) rankInput.placeholder = "e.g. 4500 (JEE Advanced)";
    } else if (["NIT", "IIIT", "GFTI"].includes(instType)) {
      if (rankLabel) rankLabel.textContent = "JEE Main Rank";
      if (rankHint) rankHint.textContent = "Enter your JEE Main rank to explore cutoffs.";
      if (rankInput) rankInput.placeholder = "e.g. 15000 (JEE Main)";
    } else {
      if (rankLabel) rankLabel.textContent = "JEE Rank (Select Institute Type)";
      if (rankHint) rankHint.textContent = "Select an Institute Type above (IIT for JEE Advanced, NIT/IIIT/GFTI for JEE Main) to compare cutoffs.";
      if (rankInput) rankInput.placeholder = "Select institute type first";
    }

    lastSelectedInstituteType = instType;
  }

  function collectFilters() {
    const rankVal = $("ex-rank")?.value.trim() || "";
    const instType = $("ex-instituteType")?.value || "";
    const examRankType = instType === "IIT" ? "JEE_ADVANCED" : (["NIT", "IIIT", "GFTI"].includes(instType) ? "JEE_MAIN" : "");

    return {
      search: $("ex-search")?.value.trim() || "",
      instituteName: $("ex-instituteName")?.value.trim() || "",
      branch: $("ex-branch")?.value.trim() || "",
      instituteType: instType,
      examRankType,
      year: $("ex-year")?.value || "",
      round: $("ex-round")?.value || "",
      quota: $("ex-quota")?.value || "",
      seatCategory: $("ex-seatCategory")?.value || "",
      genderPool: $("ex-genderPool")?.value || "",
      rankType: $("ex-rankType")?.value || "",
      rank: rankVal,
      sort: $("ex-sort")?.value || "",
      page: state.page,
      limit: state.limit
    };
  }

  function getEffectiveStudentRank() {
    const inputRank = Number($("ex-rank")?.value);
    if (Number.isFinite(inputRank) && inputRank > 0) return inputRank;
    const profile = store?.getProfile();
    const profRank = Number(profile?.rank);
    if (Number.isFinite(profRank) && profRank > 0) return profRank;
    return null;
  }

  function renderTable(records) {
    const container = $("ex-results");
    if (!container) return;

    if (!records || !records.length) {
      renderEmpty("No cutoff records matched your filters. Try clearing some filters to broaden your search.");
      return;
    }

    const studentRank = getEffectiveStudentRank();

    const rows = records.map((record) => {
      const id = record._id || record.id;
      const institute = getField(record, ["instituteName", "institute", "collegeName"]);
      const program = getField(record, ["programName", "academicProgram", "branch"]);
      const year = getField(record, ["year"]);
      const round = getField(record, ["round"]);
      const type = getField(record, ["instituteType"]);
      const quota = getField(record, ["quota"]);
      const category = getField(record, ["seatCategory", "seatType", "category"]);
      const gender = getField(record, ["genderPool", "gender"]);
      const rankType = getField(record, ["rankType"]);
      const opening = getField(record, ["openingRank", "opening"]);
      const closing = getField(record, ["closingRank", "closing"]);

      let statusHtml = '<span class="muted">—</span>';
      if (studentRank && Number.isFinite(Number(closing))) {
        const classification = utils.classifyHistoricalCutoff(studentRank, Number(closing));
        const tierCls =
          classification === "Safe"
            ? "tier-safe"
            : classification === "Target"
            ? "tier-target"
            : "tier-reach";
        statusHtml = `<span class="badge ${tierCls}">${escapeHTML(classification)}</span>`;
      }

      const isSl = store?.isShortlisted(id);
      const isCmp = store?.isCompared(id);
      const examRankType = record.examRankType || (type === "IIT" ? "JEE_ADVANCED" : "JEE_MAIN");
      const examName = record.examName || (examRankType === "JEE_ADVANCED" ? "JEE Advanced" : "JEE Main");
      const examBadgeCls = examRankType === "JEE_ADVANCED" ? "badge-adv" : "badge-main";

      if (studentRank && Number.isFinite(Number(closing))) {
        const isEligible = studentRank <= Number(closing);
        const classification = utils.classifyHistoricalCutoff(studentRank, Number(closing));
        const tierCls =
          classification === "Safe"
            ? "tier-safe"
            : classification === "Target"
            ? "tier-target"
            : "tier-reach";
        const thresholdBadge = isEligible
          ? `<span class="tag-status status-within" title="Your entered rank (${studentRank}) is within the historical closing cutoff (${closing})">✓ Within cutoff (${studentRank} ≤ ${closing})</span>`
          : `<span class="tag-status status-outside" title="Your entered rank (${studentRank}) is outside the historical closing cutoff (${closing})">✗ Beyond cutoff (${studentRank} > ${closing})</span>`;

        statusHtml = `<div style="display:flex; flex-direction:column; gap:4px;"><span class="badge ${tierCls}">${escapeHTML(classification)}</span>${thresholdBadge}</div>`;
      }

      return `
        <tr data-record-id="${escapeHTML(id)}">
          <td data-label="Institute">
            <strong>${escapeHTML(institute)}</strong>
            <span class="badge badge-type" style="margin-left: 6px;">${escapeHTML(type)}</span>
          </td>
          <td data-label="Programme">${escapeHTML(program)}</td>
          <td data-label="Exam">
            <span class="badge ${examBadgeCls}" title="Seat allocation for this institute uses ${escapeHTML(examName)}">${escapeHTML(examName)}</span>
          </td>
          <td data-label="Year">${escapeHTML(year)}</td>
          <td data-label="Round"><span class="badge">Round ${escapeHTML(round)}</span></td>
          <td data-label="Status">${statusHtml}</td>
          <td data-label="Quota"><span class="badge">${escapeHTML(quota)}</span></td>
          <td data-label="Category">${escapeHTML(category)}</td>
          <td data-label="Gender pool">${escapeHTML(gender)}</td>
          <td data-label="Rank category">${escapeHTML(rankType)}</td>
          <td data-label="Opening rank" class="num">${escapeHTML(formatNumber(opening))}</td>
          <td data-label="Closing rank" class="num"><strong>${escapeHTML(formatNumber(closing))}</strong></td>
          <td data-label="Actions">
            <div class="row-actions">
              <button type="button" class="btn btn-ghost btn-sm btn-sl-toggle"
                data-id="${escapeHTML(id)}"
                aria-pressed="${isSl ? "true" : "false"}"
                title="${isSl ? "Remove from My List" : "Save to My List"}">
                ${isSl ? "⭐ Saved" : "☆ Save"}
              </button>
              <button type="button" class="btn btn-ghost btn-sm btn-cmp-toggle"
                data-id="${escapeHTML(id)}"
                aria-pressed="${isCmp ? "true" : "false"}"
                title="${isCmp ? "Remove from compare" : "Add to compare"}">
                ${isCmp ? "✓ Comparing" : "+ Compare"}
              </button>
              <a class="btn btn-ghost btn-sm" href="#/college/${escapeHTML(id)}" title="View full cutoff details">
                Details
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Institute</th>
              <th>Programme</th>
              <th>Exam</th>
              <th>Year</th>
              <th>Round</th>
              <th>Status</th>
              <th>Quota</th>
              <th>Category</th>
              <th>Gender pool</th>
              <th>Rank category</th>
              <th>Opening</th>
              <th>Closing</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    // Attach row action listeners
    container.querySelectorAll(".btn-sl-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const rec = state.records.find((r) => String(r._id || r.id) === String(id));
        if (rec) {
          const nowSaved = store.toggleShortlist(rec);
          btn.setAttribute("aria-pressed", String(nowSaved));
          btn.innerHTML = nowSaved ? "⭐ Saved" : "☆ Save";
        }
      });
    });

    container.querySelectorAll(".btn-cmp-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const rec = state.records.find((r) => String(r._id || r.id) === String(id));
        if (rec) {
          const nowCompared = store.toggleComparison(rec);
          btn.setAttribute("aria-pressed", String(nowCompared));
          btn.innerHTML = nowCompared ? "✓ Comparing" : "+ Compare";
        }
      });
    });
  }

  function renderPagination() {
    const container = $("ex-pagination");
    if (!container) return;

    const totalPages = Math.max(1, Math.ceil(state.total / state.limit));

    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    let buttons = "";

    // First page jump
    if (state.page > 2) {
      buttons += `<button type="button" class="btn btn-ghost btn-sm" data-page="1" title="First page">« First</button>`;
    }

    // Previous button
    buttons += `
      <button type="button" class="btn btn-ghost btn-sm" data-page="${state.page - 1}" ${
      state.page <= 1 ? "disabled" : ""
    }>
        ‹ Prev
      </button>
    `;

    // Page window calculation
    let startPage = Math.max(1, state.page - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1 && state.page <= 2) {
      buttons += `<button type="button" class="btn btn-ghost btn-sm" data-page="1">1</button>`;
      if (startPage > 2) {
        buttons += `<span class="muted" style="padding: 6px;">…</span>`;
      }
    }

    for (let p = startPage; p <= endPage; p++) {
      buttons += `
        <button type="button" class="btn btn-sm ${p === state.page ? "btn-primary current" : "btn-ghost"}" data-page="${p}">
          ${p}
        </button>
      `;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1 && state.page >= totalPages - 2) {
        buttons += `<span class="muted" style="padding: 6px;">…</span>`;
      }
      if (state.page >= totalPages - 2) {
        buttons += `<button type="button" class="btn btn-ghost btn-sm" data-page="${totalPages}">${totalPages}</button>`;
      }
    }

    // Next button
    buttons += `
      <button type="button" class="btn btn-ghost btn-sm" data-page="${state.page + 1}" ${
      state.page >= totalPages ? "disabled" : ""
    }>
        Next ›
      </button>
    `;

    // Last page jump
    if (state.page < totalPages - 1) {
      buttons += `<button type="button" class="btn btn-ghost btn-sm" data-page="${totalPages}" title="Last page">Last »</button>`;
    }

    container.innerHTML = buttons;
  }

  async function loadCutoffs() {
    if (!api || typeof api.getCutoffs !== "function") {
      showError("CX.api.getCutoffs() is not available.");
      return;
    }

    state.loading = true;
    clearError();
    showLoading();

    try {
      const filters = collectFilters();
      const response = await api.getCutoffs(filters);

      const records = response?.data || response?.records || [];
      const total = Number(response?.totalRecords ?? response?.total ?? records.length);
      const totalPages = Math.max(1, Math.ceil(total / state.limit));

      state.records = records;
      state.total = total;
      state.hasSearched = true;

      renderTable(state.records);
      renderPagination();

      const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
      const end = Math.min(state.page * state.limit, state.total);
      setStatus(
        `Showing ${start}–${end} of ${state.total.toLocaleString("en-IN")} cutoff records (Page ${state.page} of ${totalPages})`
      );
    } catch (error) {
      console.error("Cutoff API error:", error);
      renderEmpty("Could not load cutoff records.");
      showError(error.message || "Unexpected error while fetching cutoff data.");
      setStatus("Could not load cutoff records.");
    } finally {
      state.loading = false;
    }
  }

  function resetFilters() {
    const ids = [
      "ex-search",
      "ex-instituteName",
      "ex-branch",
      "ex-instituteType",
      "ex-year",
      "ex-round",
      "ex-quota",
      "ex-seatCategory",
      "ex-genderPool",
      "ex-rankType",
      "ex-rank"
    ];

    ids.forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });

    const sortEl = $("ex-sort");
    if (sortEl) sortEl.value = "";

    const limitEl = $("ex-limit");
    if (limitEl) limitEl.value = "20";

    const alertBox = $("ex-exam-alert");
    if (alertBox) alertBox.hidden = true;
    lastSelectedInstituteType = "";
    updateDynamicRankUI();

    clearError();
    state.page = 1;
    state.limit = 20;
    state.sort = "";
    state.filters = {};

    // Reload global unconstrained options
    loadFilterOptions();

    loadCutoffs();
    utils?.toast("Filters reset to default.", "info");
  }

  function applyProfileToFilters() {
    const profile = store?.getProfile();
    if (!profile) {
      utils?.toast("No profile found. Complete your profile first.", "warn");
      window.location.hash = "#/profile";
      return;
    }

    if (profile.rank) $("ex-rank").value = profile.rank;
    if (profile.rankType) $("ex-rankType").value = profile.rankType;
    if (profile.seatCategory) $("ex-seatCategory").value = profile.seatCategory;
    if (profile.genderPool) $("ex-genderPool").value = profile.genderPool;
    if (profile.quota) $("ex-quota").value = profile.quota;
    if (profile.year) $("ex-year").value = profile.year;
    if (profile.round) $("ex-round").value = profile.round;
    if (profile.instituteType) $("ex-instituteType").value = profile.instituteType;
    if (profile.branch) $("ex-branch").value = profile.branch;

    updateDynamicRankUI();

    // Update dynamic options based on profile's instituteType if set
    if (profile.instituteType) {
      loadFilterOptions({ instituteType: profile.instituteType });
    }

    state.page = 1;
    loadCutoffs();
    utils?.toast("Applied your profile preferences to the explorer filters.", "info");
  }

  function init() {
    const form = $("explore-form");
    const resetButton = $("ex-reset");
    const pagination = $("ex-pagination");
    const sort = $("ex-sort");
    const limit = $("ex-limit");
    const useProfile = $("ex-use-profile");
    const instituteTypeSelect = $("ex-instituteType");
    const searchInput = $("ex-search");
    const rankInput = $("ex-rank");

    if (!form || !$("ex-results")) return;

    // Initial load of dynamic options & Rank label setup
    loadFilterOptions();
    updateDynamicRankUI();

    // Cascading dynamic filter: when Institute Type changes, update autocomplete institutes & dynamic rank label
    instituteTypeSelect?.addEventListener("change", (e) => {
      const type = e.target.value;
      updateDynamicRankUI();
      loadFilterOptions(type ? { instituteType: type } : {});
    });

    // Clear alerts and errors on typing rank
    rankInput?.addEventListener("input", () => {
      clearError();
      updateDynamicRankUI();
    });

    // Debounced search on typing into #ex-search
    searchInput?.addEventListener(
      "input",
      utils.debounce(() => {
        state.page = 1;
        loadCutoffs();
      }, 350)
    );

    // Form search submit
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearError();

      const rInput = $("ex-rank");
      const rankVal = rInput?.value.trim() || "";
      const instType = ($("ex-instituteType")?.value || "").trim().toUpperCase();

      if (rankVal) {
        const val = Number(rankVal);
        if (!Number.isFinite(val) || val <= 0 || !Number.isInteger(val)) {
          showError("Rank must be a positive integer.");
          $("ex-rank-error").textContent = "Rank must be a positive integer.";
          rInput?.setAttribute("aria-invalid", "true");
          rInput?.focus();
          return;
        }

        if (!instType || instType === "ALL") {
          showError("Please select an Institute Type (IIT for JEE Advanced, NIT/IIIT/GFTI for JEE Main) to search by rank.");
          $("ex-rank-error").textContent = "Please select an Institute Type above to compare rank.";
          rInput?.setAttribute("aria-invalid", "true");
          rInput?.focus();
          return;
        }
      }

      state.page = 1;
      loadCutoffs();
    });

    // Reset button
    resetButton?.addEventListener("click", resetFilters);

    // Pagination button clicks
    pagination?.addEventListener("click", (e) => {
      const button = e.target.closest("[data-page]");
      if (!button || button.disabled) return;

      const nextPage = Number(button.dataset.page);
      if (!Number.isInteger(nextPage) || nextPage < 1) return;

      state.page = nextPage;
      loadCutoffs();
      $("page-explore")?.scrollIntoView({ behavior: "smooth" });
    });

    // Sort changed
    sort?.addEventListener("change", () => {
      state.page = 1;
      loadCutoffs();
    });

    // Limit changed
    limit?.addEventListener("change", () => {
      const val = Number(limit.value);
      if (![10, 20, 50].includes(val)) return;
      state.limit = val;
      state.page = 1;
      loadCutoffs();
    });

    // Use profile button
    useProfile?.addEventListener("click", applyProfileToFilters);

    // Listen for store updates to keep shortlist / compare buttons in sync
    store?.subscribe("shortlistChanged", () => {
      if (state.records.length) renderTable(state.records);
    });
    store?.subscribe("comparisonChanged", () => {
      if (state.records.length) renderTable(state.records);
    });

    // Initial load
    loadCutoffs();
  }

  document.addEventListener("DOMContentLoaded", init);

  window.CX.colleges = {
    loadCutoffs,
    resetFilters,
    applyProfileToFilters,
    loadFilterOptions,
    getState: () => ({ ...state })
  };
})();
