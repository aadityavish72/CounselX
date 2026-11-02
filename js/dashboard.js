(function () {
  "use strict";

  window.CX = window.CX || {};

  const api = window.CX.api;
  const store = window.CX.store;
  const utils = window.CX.utils;

  const $ = (id) => document.getElementById(id);

  function escapeHTML(value) {
    return utils ? utils.escapeHTML(value) : String(value ?? "");
  }

  function formatNumber(value) {
    return utils ? utils.formatNumber(value) : String(value ?? "—");
  }

  function renderSavedColleges() {
    const savedContainer = $("dash-saved");
    if (!savedContainer) return;

    const list = store?.getShortlist() || [];

    if (!list.length) {
      savedContainer.innerHTML = `
        <div class="empty-state" style="padding: 24px 16px;">
          <p>No colleges saved yet.</p>
          <a class="btn btn-primary btn-sm" href="#/explore">Explore Cutoffs</a>
        </div>
      `;
      return;
    }

    const items = list
      .slice(0, 5)
      .map((item) => {
        const id = item._id || item.id;
        const inst = item.instituteName || item.institute || "Unknown Institute";
        const prog = item.programName || item.academicProgram || "Programme";
        const closing = item.closingRank ? `Closing Rank: ${formatNumber(item.closingRank)}` : "";

        return `
          <li class="mini-item">
            <div>
              <a href="#/college/${escapeHTML(id)}">${escapeHTML(inst)}</a>
              <small>${escapeHTML(prog)} ${closing ? `· ${escapeHTML(closing)}` : ""}</small>
            </div>
            <button type="button" class="btn btn-ghost btn-sm btn-del-sl" data-id="${escapeHTML(id)}" title="Remove">✕</button>
          </li>
        `;
      })
      .join("");

    savedContainer.innerHTML = `
      <ul class="mini-list">${items}</ul>
      ${list.length > 5 ? `<div style="margin-top: 12px; text-align: right;"><a href="#/shortlist" class="small">View all (${list.length}) →</a></div>` : ""}
    `;

    savedContainer.querySelectorAll(".btn-del-sl").forEach((btn) => {
      btn.addEventListener("click", () => {
        store?.removeShortlist(btn.dataset.id);
      });
    });
  }

  function updateProfileSection() {
    const profile = store?.getProfile();
    const noProfileBox = $("dash-no-profile");
    const welcome = $("dash-welcome");
    const sub = $("dash-sub");

    if (profile && profile.rank) {
      if (noProfileBox) noProfileBox.hidden = true;
      if (welcome) welcome.textContent = "Your Counselling Dashboard";
      if (sub) {
        sub.textContent = `Personalized for Rank ${formatNumber(profile.rank)} · ${profile.seatCategory || "OPEN"} · ${profile.quota || "All Quotas"}`;
      }
    } else {
      if (noProfileBox) noProfileBox.hidden = false;
      if (welcome) welcome.textContent = "Welcome to CounselX";
      if (sub) sub.textContent = "Your counselling overview.";
    }
  }

  async function loadDashboard() {
    updateProfileSection();
    renderSavedColleges();

    const statsContainer = $("dash-stats");
    const recentContainer = $("dash-recent");

    try {
      const response = await api.getDashboardSummary();
      if (!response || !response.success) {
        throw new Error(response?.message || "Failed to load dashboard summary.");
      }

      const stats = response.stats || {};

      // If discrete stat cards are in index.html:
      const totalRecEl = $("total-records");
      const totalInstEl = $("total-institutes");
      const totalProgEl = $("total-programmes");
      const totalYearsEl = $("total-years");

      if (totalRecEl) totalRecEl.textContent = formatNumber(stats.totalRecords);
      if (totalInstEl) totalInstEl.textContent = formatNumber(stats.totalInstitutes);
      if (totalProgEl) totalProgEl.textContent = formatNumber(stats.totalProgrammes);
      if (totalYearsEl) totalYearsEl.textContent = formatNumber(stats.totalYears);

      // Render recent cutoffs
      if (recentContainer) {
        const records = Array.isArray(response.recentCutoffs) ? response.recentCutoffs : [];

        if (!records.length) {
          recentContainer.innerHTML = `<p class="muted">No recent cutoff records available.</p>`;
          return;
        }

        recentContainer.innerHTML = `
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>Institute</th>
                  <th>Programme</th>
                  <th>Round</th>
                  <th>Closing Rank</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${records
                  .map((rec) => {
                    const id = rec._id || rec.id;
                    const inst = rec.instituteName || rec.institute || "—";
                    const prog = rec.programName || rec.academicProgram || "—";
                    const rnd = rec.round ? `R${rec.round}` : "—";
                    const closing = formatNumber(rec.closingRank);

                    return `
                      <tr>
                        <td data-label="Institute"><strong>${escapeHTML(inst)}</strong></td>
                        <td data-label="Programme">${escapeHTML(prog)}</td>
                        <td data-label="Round">${escapeHTML(rnd)}</td>
                        <td data-label="Closing rank" class="num">${escapeHTML(closing)}</td>
                        <td data-label="Action">
                          <a class="btn btn-ghost btn-sm" href="#/college/${escapeHTML(id)}">View</a>
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (error) {
      console.error("Dashboard error:", error);
      if (recentContainer) {
        recentContainer.innerHTML = `<div class="alert alert-error">Failed to load live dashboard statistics. Please ensure backend is running.</div>`;
      }
    }
  }

  // Reactive listeners
  store?.subscribe("shortlistChanged", renderSavedColleges);
  store?.subscribe("profileChanged", updateProfileSection);

  document.addEventListener("DOMContentLoaded", loadDashboard);

  window.CX.dashboard = {
    load: loadDashboard
  };
})();
