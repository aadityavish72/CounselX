(function () {
  "use strict";

  window.CX = window.CX || {};

  const store = window.CX.store;
  const utils = window.CX.utils;

  const $ = (id) => document.getElementById(id);

  function renderComparison() {
    const container = $("cmp-body");
    if (!container) return;

    const list = store?.getComparison() || [];

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No colleges in comparison</h3>
          <p>You haven't added any colleges to compare yet. Browse cutoffs and click the <strong>+ Compare</strong> button on any record to compare up to 4 options side-by-side.</p>
          <a class="btn btn-primary btn-sm" href="#/explore">Explore Cutoffs</a>
        </div>
      `;
      return;
    }

    const profile = store?.getProfile();
    const studentRank = profile?.rank ? Number(profile.rank) : null;

    // Find best (most competitive / lowest) closing rank among compared
    const closingRanks = list
      .map((r) => Number(r.closingRank))
      .filter((n) => Number.isFinite(n) && n > 0);
    const minClosing = closingRanks.length ? Math.min(...closingRanks) : null;

    let headersHtml = "<th>Parameter</th>";
    list.forEach((rec) => {
      const id = rec._id || rec.id;
      const inst = rec.instituteName || rec.institute || "—";
      const prog = rec.programName || rec.academicProgram || "—";
      headersHtml += `
        <th>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <strong>${utils.escapeHTML(inst)}</strong>
              <small style="display: block; color: var(--mu); margin-top: 4px;">${utils.escapeHTML(prog)}</small>
            </div>
            <button type="button" class="btn btn-ghost btn-sm btn-cmp-rm" data-id="${utils.escapeHTML(id)}" title="Remove column">✕</button>
          </div>
        </th>
      `;
    });

    function makeRow(label, extractor, highlightBest = false) {
      let row = `<tr><th>${utils.escapeHTML(label)}</th>`;
      list.forEach((rec) => {
        const val = extractor(rec);
        const isBest = highlightBest && minClosing && Number(rec.closingRank) === minClosing;
        row += `<td class="${isBest ? "best" : ""}">${val}</td>`;
      });
      row += "</tr>";
      return row;
    }

    let rowsHtml = "";
    rowsHtml += makeRow("Institute Group", (r) => `<span class="badge badge-type">${utils.escapeHTML(r.instituteType || "IIT")}</span>`);
    rowsHtml += makeRow("Counselling Year", (r) => utils.escapeHTML(r.year || 2026));
    rowsHtml += makeRow("JoSAA Round", (r) => `Round ${utils.escapeHTML(r.round || "1")}`);
    rowsHtml += makeRow("Quota", (r) => utils.escapeHTML(r.quota || "—"));
    rowsHtml += makeRow("Seat Category", (r) => utils.escapeHTML(r.seatCategory || r.seatType || "—"));
    rowsHtml += makeRow("Gender Pool", (r) => utils.escapeHTML(r.genderPool || r.gender || "—"));
    rowsHtml += makeRow("Rank Type", (r) => utils.escapeHTML(r.rankType || "—"));
    rowsHtml += makeRow("Opening Rank", (r) => `<strong>${utils.formatNumber(r.openingRank)}</strong>`);
    rowsHtml += makeRow("Closing Rank", (r) => `<strong>${utils.formatNumber(r.closingRank)}</strong>`, true);

    if (studentRank) {
      rowsHtml += makeRow(`Status (Rank ${utils.formatNumber(studentRank)})`, (r) => {
        const c = Number(r.closingRank);
        if (!Number.isFinite(c)) return "—";
        const status = utils.classifyHistoricalCutoff(studentRank, c);
        const cls = status === "Safe" ? "tier-safe" : status === "Target" ? "tier-target" : "tier-reach";
        return `<span class="badge ${cls}">${status}</span>`;
      });
    }

    // Actions row
    rowsHtml += `<tr><th>Actions</th>`;
    list.forEach((rec) => {
      const id = rec._id || rec.id;
      const isSl = store?.isShortlisted(id);
      rowsHtml += `
        <td>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm btn-cmp-sl" data-id="${utils.escapeHTML(id)}" aria-pressed="${isSl ? "true" : "false"}">
              ${isSl ? "⭐ Saved" : "☆ Save"}
            </button>
            <a class="btn btn-ghost btn-sm" href="#/college/${utils.escapeHTML(id)}">Details</a>
          </div>
        </td>
      `;
    });
    rowsHtml += `</tr>`;

    container.innerHTML = `
      <div class="cmp-wrap">
        <table class="cmp">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    // Remove handlers
    container.querySelectorAll(".btn-cmp-rm").forEach((btn) => {
      btn.addEventListener("click", () => {
        store?.removeComparison(btn.dataset.id);
      });
    });

    // Shortlist handlers
    container.querySelectorAll(".btn-cmp-sl").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const rec = list.find((r) => String(r._id || r.id) === String(id));
        if (rec) {
          const nowSaved = store?.toggleShortlist(rec);
          btn.setAttribute("aria-pressed", String(nowSaved));
          btn.innerHTML = nowSaved ? "⭐ Saved" : "☆ Save";
        }
      });
    });
  }

  function init() {
    $("cmp-clear")?.addEventListener("click", () => {
      store?.clearComparison();
    });

    store?.subscribe("comparisonChanged", renderComparison);
  }

  document.addEventListener("DOMContentLoaded", init);

  window.CX.comparison = {
    render: renderComparison
  };
})();
