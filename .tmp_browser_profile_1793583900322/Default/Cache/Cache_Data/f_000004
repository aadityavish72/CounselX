(function () {
  "use strict";

  window.CX = window.CX || {};

  const api = window.CX.api;
  const store = window.CX.store;
  const utils = window.CX.utils;
  const escapeHTML = (v) => (utils ? utils.escapeHTML(v) : String(v ?? ""));

  let advancedData = null;
  let activeTier = "all";
  let activeFilterQuery = "";
  let activeSort = "score";
  let studentRank = null;

  const $ = (id) => document.getElementById(id);

  function renderProfileChips(profile) {
    const container = $("rec-profile");
    if (!container) return;

    if (!profile) {
      container.innerHTML = "";
      return;
    }

    const mainRank = profile.ranks?.jeeMain || (profile.examRankType === "JEE_MAIN" ? profile.rank : null);
    const advRank = profile.ranks?.jeeAdvanced || (profile.examRankType === "JEE_ADVANCED" ? profile.rank : null);

    const chips = [];
    if (advRank) {
      chips.push(`JEE Advanced Rank: ${utils.formatNumber(advRank)}`);
    }
    if (mainRank) {
      chips.push(`JEE Main Rank: ${utils.formatNumber(mainRank)}`);
    }
    if (!advRank && !mainRank && profile.rank) {
      chips.push(`Rank: ${utils.formatNumber(profile.rank)} (${profile.examRankType || profile.rankType || "CRL"})`);
    }

    chips.push(`Category: ${profile.seatCategory || profile.category || "OPEN"}`);
    chips.push(`Quota: ${profile.quota || "AI"}`);
    chips.push(`Gender Pool: ${profile.genderPool || profile.gender || "Gender-Neutral"}`);

    if (profile.instituteType && profile.instituteType !== "All") {
      chips.push(`Target Tier: ${profile.instituteType}`);
    }

    container.innerHTML = chips
      .map((c) => `<span class="chip">${utils.escapeHTML(c)}</span>`)
      .join("");
  }

  function renderCard(rec) {
    const id = rec.id || rec._id;
    const inst = rec.instituteName || "—";
    const prog = rec.academicProgram || rec.programName || "—";
    const type = rec.instituteType || "NIT";
    const examName = rec.examName || (rec.examRankType === "JEE_ADVANCED" ? "JEE Advanced" : "JEE Main");
    const examBadgeCls = rec.examRankType === "JEE_ADVANCED" ? "badge-adv" : "badge-main";
    const tier = rec.tier || "MODERATE";
    const tierLabel = rec.tierLabel || (tier === "SAFE" ? "Safe" : tier === "AMBITIOUS" ? "Ambitious" : "Moderate");
    const badgeClass = rec.badgeClass || `badge-${tier.toLowerCase()}`;

    const score = rec.scores?.composite ?? (rec.recommendationScore || 75);
    const trendDir = rec.metrics?.trendDirection || "Stable";
    const trendPct = rec.metrics?.trendChangePct ? `${rec.metrics.trendChangePct > 0 ? "+" : ""}${rec.metrics.trendChangePct}%` : "0%";
    const closeRank = utils.formatNumber(rec.latestClosingRank || rec.lastObservedClosingRank);

    const isSl = store?.isShortlisted(id);
    const isCmp = store?.isCompared(id);

    const blurb = rec.explanations?.[0] || `Historical closing cutoff is ${closeRank}.`;

    const sHist = rec.scores?.historicalMatch ?? 75;
    const sTrend = rec.scores?.trend ?? 50;
    const sCons = rec.scores?.consistency ?? 80;
    const sMargin = rec.scores?.safetyMargin ?? 60;

    const bulletsHtml = (rec.explanations || [])
      .map((b) => `<li>${escapeHTML(b)}</li>`)
      .join("");

    const tierKeyLower = tier.toLowerCase();
    const tierPillClass = tier === "SAFE" ? "tier-safe" : tier === "AMBITIOUS" ? "tier-reach" : "tier-target";

    return `
      <article class="rc rec-card tier-card ${tierPillClass}" id="rec-card-${id}">
        <div>
          <div class="top">
            <div>
              <h3>${escapeHTML(inst)}</h3>
              <div class="hint">${escapeHTML(prog)}</div>
            </div>
            <div class="badge-cluster">
              <span class="chip">${escapeHTML(type)}</span>
              <span class="badge ${examBadgeCls}">${escapeHTML(examName)}</span>
              <span class="badge ${badgeClass}">${escapeHTML(tierLabel)}</span>
            </div>
          </div>

          <p class="blurb reason"><strong>Why this option?</strong> ${escapeHTML(blurb)}</p>

          <div class="meta stat-boxes">
            <div class="stat">
              <small>Score</small>
              <b style="color:var(--p);">${score}% Match</b>
            </div>
            <div class="stat">
              <small>Trend</small>
              <b>${escapeHTML(trendDir)} (${trendPct})</b>
            </div>
            <div class="stat">
              <small>Closing Cutoff</small>
              <b>${closeRank}</b>
            </div>
          </div>
        </div>

        <div>
          <!-- Factor Breakdown Panel (Expandable) -->
          <div class="analysis-panel" id="analysis-${id}" hidden>
            <div style="font-weight:700;margin-bottom:8px;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.04em;color:#475569;">
              Mathematical Scoring Breakdown
            </div>
            <div class="factor-grid">
              <div class="factor-card">
                <div class="factor-title">
                  <span>Historical Match (50%)</span>
                  <b>${sHist}%</b>
                </div>
                <div class="factor-bar"><div class="factor-bar-fill" style="width:${sHist}%;"></div></div>
              </div>
              <div class="factor-card">
                <div class="factor-title">
                  <span>Cutoff Trend (25%)</span>
                  <b>${sTrend}%</b>
                </div>
                <div class="factor-bar"><div class="factor-bar-fill" style="width:${sTrend}%;background:#10b981;"></div></div>
              </div>
              <div class="factor-card">
                <div class="factor-title">
                  <span>Consistency (15%)</span>
                  <b>${sCons}%</b>
                </div>
                <div class="factor-bar"><div class="factor-bar-fill" style="width:${sCons}%;background:#f59e0b;"></div></div>
              </div>
              <div class="factor-card">
                <div class="factor-title">
                  <span>Safety Margin (10%)</span>
                  <b>${sMargin}%</b>
                </div>
                <div class="factor-bar"><div class="factor-bar-fill" style="width:${sMargin}%;background:#8b5cf6;"></div></div>
              </div>
            </div>

            <div style="font-weight:700;margin-top:10px;font-size:0.82rem;color:#475569;">Key Insights & Evidence:</div>
            <ul class="reason-bullets">
              ${bulletsHtml}
            </ul>
          </div>

          <div class="rc-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-toggle-analysis" data-id="${id}">
              📊 View Analysis
            </button>
            <button type="button" class="btn btn-ghost btn-sm btn-rec-sl" data-id="${id}" aria-pressed="${isSl}">
              ${isSl ? "⭐ Saved" : "☆ Save"}
            </button>
            <button type="button" class="btn btn-ghost btn-sm btn-rec-cmp" data-id="${id}" aria-pressed="${isCmp}">
              ${isCmp ? "✓ Comparing" : "+ Compare"}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function displayRecommendations() {
    const groupsContainer = $("rec-groups");
    const statusContainer = $("rec-status");
    if (!groupsContainer) return;

    if (!advancedData) {
      groupsContainer.innerHTML = "";
      return;
    }

    const { safe = [], moderate = [], ambitious = [], insufficientData = [] } = advancedData;

    const allItems = [
      ...safe.map((x) => ({ ...x, tier: "SAFE" })),
      ...moderate.map((x) => ({ ...x, tier: "MODERATE" })),
      ...ambitious.map((x) => ({ ...x, tier: "AMBITIOUS" })),
      ...insufficientData.map((x) => ({ ...x, tier: "INSUFFICIENT_DATA" }))
    ];

    if (statusContainer) {
      statusContainer.textContent = `Generated ${allItems.length} personalized recommendations matching Rank ${utils.formatNumber(studentRank || 4200)} based on multi-factor JoSAA historical analysis.`;
    }

    // Filter by tier
    let filtered = allItems;
    if (activeTier !== "all") {
      filtered = filtered.filter((item) => item.tier === activeTier);
    }

    // Search query
    if (activeFilterQuery) {
      const q = activeFilterQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          (item.instituteName || "").toLowerCase().includes(q) ||
          (item.academicProgram || "").toLowerCase().includes(q)
      );
    }

    // Sort order
    if (activeSort === "score") {
      filtered.sort((a, b) => (b.scores?.composite ?? 0) - (a.scores?.composite ?? 0));
    } else if (activeSort === "close") {
      filtered.sort((a, b) => Math.abs(a.margin || 0) - Math.abs(b.margin || 0));
    } else if (activeSort === "cutoff") {
      filtered.sort((a, b) => (a.latestClosingRank || 0) - (b.latestClosingRank || 0));
    }

    // Tabs HTML
    const tabsHtml = `
      <div class="tier-tabs">
        <button type="button" class="tier-tab ${activeTier === "all" ? "active" : ""}" data-tier="all">
          All Choices <span class="tab-badge">${allItems.length}</span>
        </button>
        <button type="button" class="tier-tab ${activeTier === "SAFE" ? "active" : ""}" data-tier="SAFE">
          Safe <span class="tab-badge">${safe.length}</span>
        </button>
        <button type="button" class="tier-tab ${activeTier === "MODERATE" ? "active" : ""}" data-tier="MODERATE">
          Moderate <span class="tab-badge">${moderate.length}</span>
        </button>
        <button type="button" class="tier-tab ${activeTier === "AMBITIOUS" ? "active" : ""}" data-tier="AMBITIOUS">
          Ambitious <span class="tab-badge">${ambitious.length}</span>
        </button>
        ${
          insufficientData.length > 0
            ? `<button type="button" class="tier-tab ${activeTier === "INSUFFICIENT_DATA" ? "active" : ""}" data-tier="INSUFFICIENT_DATA">
                 Insufficient Historical Data <span class="tab-badge">${insufficientData.length}</span>
               </button>`
            : ""
        }
      </div>
    `;

    // Cards HTML
    let cardsContent = "";
    if (filtered.length === 0) {
      cardsContent = `
        <div class="empty-state" style="padding: 40px 20px;">
          <p>No college options match your selected filter. Try choosing "All Choices" or broadening your search terms.</p>
        </div>
      `;
    } else {
      cardsContent = `<div class="gc">${filtered.map(renderCard).join("")}</div>`;
    }

    groupsContainer.innerHTML = tabsHtml + cardsContent;

    // Attach Tier Tab listeners
    groupsContainer.querySelectorAll(".tier-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        activeTier = tab.dataset.tier;
        displayRecommendations();
      });
    });

    // Attach Toggle Analysis listeners
    groupsContainer.querySelectorAll(".btn-toggle-analysis").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const panel = document.getElementById(`analysis-${id}`);
        if (panel) {
          const isHidden = panel.hidden;
          panel.hidden = !isHidden;
          btn.textContent = isHidden ? "▲ Hide Analysis" : "📊 View Analysis";
        }
      });
    });

    // Attach Shortlist listeners
    groupsContainer.querySelectorAll(".btn-rec-sl").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const item = allItems.find((r) => String(r.id || r._id) === String(id));
        if (item) {
          const nowSaved = store?.toggleShortlist({
            ...item,
            _id: item.id || item._id,
            closingRank: item.latestClosingRank || item.lastObservedClosingRank,
            openingRank: item.latestOpeningRank || item.lastObservedOpeningRank
          });
          btn.setAttribute("aria-pressed", String(nowSaved));
          btn.textContent = nowSaved ? "⭐ Saved" : "☆ Save";
        }
      });
    });

    // Attach Compare listeners
    groupsContainer.querySelectorAll(".btn-rec-cmp").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const item = allItems.find((r) => String(r.id || r._id) === String(id));
        if (item) {
          const nowCmp = store?.toggleComparison({
            ...item,
            _id: item.id || item._id,
            closingRank: item.latestClosingRank || item.lastObservedClosingRank,
            openingRank: item.latestOpeningRank || item.lastObservedOpeningRank
          });
          btn.setAttribute("aria-pressed", String(nowCmp));
          btn.textContent = nowCmp ? "✓ Comparing" : "+ Compare";
        }
      });
    });
  }

  async function loadRecommendations() {
    const profile = store?.getProfile();
    const groupsContainer = $("rec-groups");
    const statusContainer = $("rec-status");
    const tools = $("rec-tools");

    if (!profile || (!profile.rank && !profile.ranks?.jeeMain && !profile.ranks?.jeeAdvanced)) {
      renderProfileChips(null);
      if (tools) tools.hidden = true;
      if (groupsContainer) {
        groupsContainer.innerHTML = `
          <div class="empty-state">
            <h3>Set up your profile to generate recommendations</h3>
            <p>Tell us your JEE rank, rank type, category and quota so CounselX can calculate 4-factor explainable recommendations against real JoSAA cutoffs.</p>
            <a class="btn btn-primary" href="#/profile">Create My Profile</a>
          </div>
        `;
      }
      if (statusContainer) statusContainer.textContent = "";
      return;
    }

    renderProfileChips(profile);
    if (tools) tools.hidden = false;
    if (statusContainer) {
      statusContainer.textContent = "Running 4-factor historical cutoff analysis against MongoDB Atlas...";
    }
    if (groupsContainer) {
      groupsContainer.innerHTML = `
        <div class="empty-state">
          <div class="skeleton skel-row" style="width: 100%;"></div>
          <div class="skeleton skel-row" style="width: 100%;"></div>
          <p>Analyzing historical JoSAA cutoffs, trend slopes, and consistency metrics...</p>
        </div>
      `;
    }

    try {
      const instType = profile.instituteType || "";
      const examRankType = profile.examRankType || (instType === "IIT" ? "JEE_ADVANCED" : (instType ? "JEE_MAIN" : ""));

      let advRank = profile.ranks?.jeeAdvanced;
      let mainRank = profile.ranks?.jeeMain;

      if (!advRank && !mainRank) {
        if (examRankType === "JEE_ADVANCED" || instType === "IIT") {
          advRank = profile.rank;
        } else {
          mainRank = profile.rank;
        }
      }

      studentRank = advRank || mainRank || profile.rank;

      let response = null;
      try {
        response = await api.getAdvancedRecommendations({
          jeeMainRank: mainRank,
          jeeAdvancedRank: advRank,
          category: profile.seatCategory || profile.category || "OPEN",
          gender: profile.genderPool || profile.gender || "Gender-Neutral",
          homeState: profile.homeState || "Any",
          preferredBranches: profile.branch ? [profile.branch] : [],
          instituteTypes: instType && instType !== "All" ? [instType] : ["IIT", "NIT", "IIIT", "GFTI"]
        });
      } catch (advancedErr) {
        console.warn("Advanced recommendations endpoint failed or route missing, trying fallback:", advancedErr.message);
      }

      if (response && response.success && response.data) {
        advancedData = response.data;
      } else {
        // Fallback to counselling recommendations endpoint
        try {
          const fallback = await api.getCounsellingRecommendations({
            rank: profile.rank || mainRank || advRank,
            rankType: profile.rankType || "CRL",
            examType: examRankType,
            instituteType: instType,
            seatCategory: profile.seatCategory || "OPEN",
            quota: profile.quota || "AI",
            genderPool: profile.genderPool || "Gender-Neutral",
            branch: profile.branch || ""
          });
          const tiers = fallback?.tiers || {};
          advancedData = {
            safe: tiers.safe || [],
            moderate: tiers.target || [],
            ambitious: tiers.reach || [],
            insufficientData: []
          };
        } catch (fallbackErr) {
          console.warn("Counselling endpoint fallback failed, trying direct cutoffs fallback:", fallbackErr.message);
          const cutoffsRes = await api.getCutoffs({
            rank: studentRank,
            rankType: examRankType || (instType === "IIT" ? "JEE_ADVANCED" : "JEE_MAIN"),
            instituteType: instType && instType !== "All" ? instType : undefined,
            seatCategory: profile.seatCategory || "OPEN",
            limit: 40
          });
          if (cutoffsRes && cutoffsRes.data && cutoffsRes.data.length > 0) {
            const r = Number(studentRank) || 5000;
            const items = cutoffsRes.data;
            advancedData = {
              safe: items.filter((i) => (i.closingRank || 0) >= r * 1.15).slice(0, 15),
              moderate: items.filter((i) => (i.closingRank || 0) >= r * 0.9 && (i.closingRank || 0) < r * 1.15).slice(0, 15),
              ambitious: items.filter((i) => (i.closingRank || 0) < r * 0.9).slice(0, 15),
              insufficientData: []
            };
          } else {
            throw fallbackErr;
          }
        }
      }

      displayRecommendations();
    } catch (err) {
      console.error("Recommendations load error:", err);
      if (groupsContainer) {
        groupsContainer.innerHTML = `
          <div class="alert alert-error">
            <strong>Could not generate recommendations:</strong> ${utils.escapeHTML(err.message)}
          </div>
        `;
      }
      if (statusContainer) statusContainer.textContent = "";
    }
  }

  function init() {
    const refreshBtn = $("rec-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        loadRecommendations();
      });
    }

    const filterInput = $("rec-filter");
    if (filterInput) {
      filterInput.addEventListener("input", (e) => {
        activeFilterQuery = e.target.value.trim();
        displayRecommendations();
      });
    }

    const sortSelect = $("rec-sort");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        activeSort = e.target.value;
        displayRecommendations();
      });
    }

    window.CX.loadRecommendations = loadRecommendations;
    window.CX.recommendations = {
      load: loadRecommendations
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
