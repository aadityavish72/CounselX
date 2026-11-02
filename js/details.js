(function () {
  "use strict";

  window.CX = window.CX || {};

  const api = window.CX.api;
  const store = window.CX.store;
  const utils = window.CX.utils;

  const $ = (id) => document.getElementById(id);

  async function loadDetails(id) {
    const container = $("college-body");
    if (!container) return;

    if (!id) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No college record specified</h3>
          <a class="btn btn-primary" href="#/explore">Return to Cutoff Explorer</a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="empty-state">
        <div class="skeleton skel-card"></div>
        <p>Loading cutoff record details from CounselX database…</p>
      </div>
    `;

    try {
      const response = await api.getCutoffById(id);
      const record = response?.data;

      if (!record) {
        throw new Error("Record not found.");
      }

      // Add to recently viewed
      store?.addRecent(record);

      const inst = record.instituteName || record.institute || "—";
      const prog = record.programName || record.academicProgram || "—";
      const type = record.instituteType || "IIT";
      const open = utils.formatNumber(record.openingRank);
      const close = utils.formatNumber(record.closingRank);
      const quota = record.quota || "—";
      const cat = record.seatCategory || record.seatType || "—";
      const gender = record.genderPool || record.gender || "—";
      const rankType = record.rankType || "—";
      const round = record.round ? `Round ${record.round}` : "—";
      const year = record.year || 2026;

      // Fetch explainable cutoff prediction for this trajectory
      let predictionHtml = "";
      try {
        const predRes = await api.predictCutoff({
          instituteName: inst,
          branch: prog,
          seatCategory: cat,
          quota: quota,
          genderPool: gender,
          rankType: rankType,
          targetRound: 5
        });

        if (predRes && predRes.success && predRes.prediction) {
          const pred = predRes.prediction;
          const pRange = pred.predictedRange;
          const confidence = pred.confidenceLevel || "MEDIUM";
          const uncertainty = pred.uncertaintyScore ? `±${pred.uncertaintyScore}%` : "";
          const history = predRes.historicalRounds || [];

          let roundsTimeline = "";
          if (history.length) {
            roundsTimeline = `
              <div class="table-wrap" style="margin-top: 12px; margin-bottom: 12px;">
                <table class="data">
                  <thead>
                    <tr>
                      <th>JoSAA Round</th>
                      <th>Opening Rank</th>
                      <th>Closing Rank</th>
                      <th>Shift from Round 1</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${history
                      .map((h) => {
                        const r1Close = Number(history[0].closingRank);
                        const curClose = Number(h.closingRank);
                        const delta = curClose - r1Close;
                        const deltaText = delta > 0 ? `+${utils.formatNumber(delta)} ranks` : delta === 0 ? "Baseline" : `${utils.formatNumber(delta)}`;
                        return `
                          <tr>
                            <td><strong>Round ${h.round}</strong></td>
                            <td class="num">${utils.formatNumber(h.openingRank)}</td>
                            <td class="num"><strong>${utils.formatNumber(h.closingRank)}</strong></td>
                            <td>${deltaText}</td>
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
            `;
          }

          predictionHtml = `
            <div class="card mt">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <h2 class="card-title" style="margin: 0;">Explainable Cutoff Trajectory & Prediction</h2>
                <div>
                  <span class="badge ${confidence === "HIGH" ? "badge-soft" : ""}">Confidence: ${confidence}</span>
                  <span class="badge">Uncertainty: ${uncertainty}</span>
                </div>
              </div>
              <p class="muted" style="margin-top: 8px;">${utils.escapeHTML(pred.explanation || "")}</p>
              ${roundsTimeline}
              ${
                pRange
                  ? `
                <div class="grid grid-3" style="margin-top: 12px;">
                  <div class="rank-box">
                    <small>Conservative Bound (Min)</small>
                    <b>${utils.formatNumber(pRange.min)}</b>
                  </div>
                  <div class="rank-box" style="border: 2px solid var(--p);">
                    <small style="color: var(--p);">Expected Final Cutoff</small>
                    <b style="color: var(--p);">${utils.formatNumber(pRange.expected)}</b>
                  </div>
                  <div class="rank-box">
                    <small>Optimistic Bound (Max)</small>
                    <b>${utils.formatNumber(pRange.max)}</b>
                  </div>
                </div>
              `
                  : ""
              }
              <div class="alert alert-info mt" style="margin-bottom: 0;">
                <small>${utils.escapeHTML(pred.disclaimer || "")}</small>
              </div>
            </div>
          `;
        }
      } catch (predErr) {
        console.warn("Could not load prediction for details page:", predErr);
      }

      // Comparison with student's rank if available
      const profile = store?.getProfile();
      let rankComparisonHtml = "";
      if (profile && profile.rank && Number.isFinite(Number(record.closingRank))) {
        const studentRank = Number(profile.rank);
        const closingNum = Number(record.closingRank);
        const classification = utils.classifyHistoricalCutoff(studentRank, closingNum);
        const diff = closingNum - studentRank;
        rankComparisonHtml = `
          <div class="alert alert-info mt">
            <strong>Rank Evaluation for your Rank (${utils.formatNumber(studentRank)}):</strong>
            You are categorized in the <strong>${utils.escapeHTML(classification)}</strong> range
            (${diff >= 0 ? `+${utils.formatNumber(diff)} margin inside cutoff` : `${utils.formatNumber(Math.abs(diff))} ranks away from cutoff`}).
          </div>
        `;
      }

      const isSl = store?.isShortlisted(id);
      const isCmp = store?.isCompared(id);

      container.innerHTML = `
        <div class="detail-hero">
          <div class="rec-top">
            <span class="badge">${utils.escapeHTML(type)}</span>
            <span class="badge">${utils.escapeHTML(year)}</span>
            <span class="badge">${utils.escapeHTML(round)}</span>
            <span class="badge">${utils.escapeHTML(quota)}</span>
          </div>
          <h2>${utils.escapeHTML(inst)}</h2>
          <p class="rec-prog">${utils.escapeHTML(prog)}</p>
          <div class="rank-pair" style="max-width: 400px;">
            <div class="rank-box">
              <small>Opening rank</small>
              <b style="font-size: 1.4rem;">${open}</b>
            </div>
            <div class="rank-box">
              <small>Closing rank</small>
              <b style="font-size: 1.4rem;">${close}</b>
            </div>
          </div>
          <div class="btn-row" style="margin-top: 12px;">
            <button type="button" class="btn btn-ghost btn-sm" id="dtl-sl-btn" aria-pressed="${isSl ? "true" : "false"}">
              ${isSl ? "⭐ In My List" : "☆ Save to My List"}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" id="dtl-cmp-btn" aria-pressed="${isCmp ? "true" : "false"}">
              ${isCmp ? "✓ Comparing" : "+ Compare"}
            </button>
            <a class="btn btn-ghost btn-sm" href="${utils.escapeHTML(record.sourceUrl || "https://josaa.admissions.nic.in/")}" target="_blank" rel="noopener">
              Official JoSAA Source ↗
            </a>
          </div>
        </div>

        ${rankComparisonHtml}

        <div class="card mt">
          <h2 class="card-title">Allotment Parameters</h2>
          <div class="detail-grid">
            <div class="kv"><dt>Quota</dt><dd>${utils.escapeHTML(quota)}</dd></div>
            <div class="kv"><dt>Seat Category</dt><dd>${utils.escapeHTML(cat)}</dd></div>
            <div class="kv"><dt>Gender Pool</dt><dd>${utils.escapeHTML(gender)}</dd></div>
            <div class="kv"><dt>Rank Type</dt><dd>${utils.escapeHTML(rankType)}</dd></div>
            <div class="kv"><dt>JoSAA Round</dt><dd>${utils.escapeHTML(round)}</dd></div>
            <div class="kv"><dt>Counselling Year</dt><dd>${utils.escapeHTML(year)}</dd></div>
            <div class="kv"><dt>Raw Opening Rank</dt><dd>${utils.escapeHTML(record.openingRankRaw || open)}</dd></div>
            <div class="kv"><dt>Raw Closing Rank</dt><dd>${utils.escapeHTML(record.closingRankRaw || close)}</dd></div>
            <div class="kv"><dt>Preparatory Rank</dt><dd>${record.isPreparatoryRank || record.closingRankPreparatory ? "Yes" : "No"}</dd></div>
            <div class="kv"><dt>Data Source</dt><dd>${utils.escapeHTML(record.source || "JoSAA")}</dd></div>
          </div>
        </div>

        ${predictionHtml}

        <details class="raw">
          <summary>Inspect Raw MongoDB Document</summary>
          <pre>${utils.escapeHTML(JSON.stringify(record, null, 2))}</pre>
        </details>
      `;

      // Button listeners
      $("dtl-sl-btn")?.addEventListener("click", () => {
        const nowSaved = store?.toggleShortlist(record);
        const btn = $("dtl-sl-btn");
        if (btn) {
          btn.setAttribute("aria-pressed", String(nowSaved));
          btn.textContent = nowSaved ? "⭐ In My List" : "☆ Save to My List";
        }
      });

      $("dtl-cmp-btn")?.addEventListener("click", () => {
        const nowCompared = store?.toggleComparison(record);
        const btn = $("dtl-cmp-btn");
        if (btn) {
          btn.setAttribute("aria-pressed", String(nowCompared));
          btn.textContent = nowCompared ? "✓ Comparing" : "+ Compare";
        }
      });
    } catch (err) {
      console.error("Details load error:", err);
      container.innerHTML = `
        <div class="alert alert-error">
          Could not load cutoff details: ${utils.escapeHTML(err.message)}
        </div>
        <a class="btn btn-secondary mt" href="#/explore">Back to Cutoff Explorer</a>
      `;
    }
  }

  window.CX.details = {
    load: loadDetails
  };
})();
