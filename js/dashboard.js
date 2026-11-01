(function() {
  'use strict';
  async function loadDashboardSummary() {
    try {
      const response = await fetch('http://localhost:5000/api/dashboard/summary');
      let data = await response.json();
      console.log('API Data:', data);
      if (data.success) {
        document.getElementById('total-records').innerText = data.stats.totalRecords;
        document.getElementById('total-institutes').innerText = data.stats.totalInstitutes;
        document.getElementById('total-programmes').innerText = data.stats.totalProgrammes;
        document.getElementById('total-years').innerText = data.stats.totalYears;
      }
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
    }
  }
  document.addEventListener('DOMContentLoaded', loadDashboardSummary);

  (function () {
  "use strict";

  window.CX = window.CX || {};

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
    const number = Number(value);

    return Number.isFinite(number)
      ? number.toLocaleString("en-IN")
      : "—";
  }

  async function loadDashboard() {
    const statsContainer = $("dash-stats");
    const recentContainer = $("dash-recent");

    if (!statsContainer || !recentContainer) return;

    statsContainer.textContent = "Loading dashboard...";
    recentContainer.textContent = "Loading recent cutoffs...";

    try {
      const response = await window.CX.api.get(
        "/dashboard/summary"
      );
      console.log("API Response:", response);
      if (!response.success) {
        throw new Error(response.message || "Dashboard API failed");
      }

      const stats = response.stats || {};

      const cards = [
        ["Total cutoff records", stats.totalRecords],
        ["Institutes", stats.totalInstitutes],
        ["Programmes", stats.totalProgrammes],
        ["Years covered", stats.totalYears]
      ];

      statsContainer.innerHTML = cards.map(([label, value]) => `
        <div class="card">
          <div class="card-title">${escapeHTML(label)}</div>
          <div class="card-value">${formatNumber(value)}</div>
        </div>
      `).join("");

      const records = Array.isArray(response.recentCutoffs)
        ? response.recentCutoffs
        : [];

      if (!records.length) {
        recentContainer.textContent = "Abhi koi cutoff record available nahi hai.";
        return;
      }

      recentContainer.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Institute</th>
                <th>Programme</th>
                <th>Year</th>
                <th>Round</th>
                <th>Closing Rank</th>
              </tr>
            </thead>
            <tbody>
              ${records.map((record) => `
                <tr>
                  <td>${escapeHTML(record.instituteName)}</td>
                  <td>${escapeHTML(record.academicProgram)}</td>
                  <td>${escapeHTML(record.year)}</td>
                  <td>${escapeHTML(record.round)}</td>
                  <td>${formatNumber(record.closingRank)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (error) {
      console.error("Dashboard error:", error);
      statsContainer.textContent = "Dashboard load nahi hua.";
      recentContainer.textContent =
        error.message || "Backend connection check karo.";
    }
  }

  // Expose the function so an existing router can call it.
  window.CX.dashboard = window.CX.dashboard || {};
  window.CX.dashboard.load = loadDashboard;

  document.addEventListener("DOMContentLoaded", loadDashboard);
})();
})();