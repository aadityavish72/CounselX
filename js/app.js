(function () {
  "use strict";

  window.CX = window.CX || {};

  const utils = window.CX.utils;
  const store = window.CX.store;
  const api = window.CX.api;

  const $ = (id) => document.getElementById(id);

  // Shortlist page rendering
  function renderShortlistPage() {
    const container = $("sl-body");
    if (!container) return;

    const list = store?.getShortlist() || [];

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Your shortlist is empty</h3>
          <p>You haven't saved any colleges yet. As you explore historical JoSAA cutoffs, click the <strong>☆ Save</strong> button on any record to build your personal reading list here.</p>
          <a class="btn btn-primary" href="#/explore">Explore JoSAA Cutoffs</a>
        </div>
      `;
      return;
    }

    const cardsHtml = list
      .map((rec) => {
        const id = rec._id || rec.id;
        const inst = rec.instituteName || rec.institute || "—";
        const prog = rec.programName || rec.academicProgram || "—";
        const type = rec.instituteType || "IIT";
        const year = rec.year || 2026;
        const round = rec.round ? `Round ${rec.round}` : "—";
        const quota = rec.quota || "—";
        const cat = rec.seatCategory || rec.seatType || "—";
        const gender = rec.genderPool || rec.gender || "—";
        const rankType = rec.rankType || "—";
        const open = utils.formatNumber(rec.openingRank);
        const close = utils.formatNumber(rec.closingRank);
        const isCmp = store?.isCompared(id);

        return `
          <article class="card" data-shortlist-id="${utils.escapeHTML(id)}" style="display: grid; gap: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
              <div>
                <div class="rec-top" style="margin-bottom: 6px;">
                  <span class="badge badge-type">${utils.escapeHTML(type)}</span>
                  <span class="badge">${utils.escapeHTML(year)}</span>
                  <span class="badge">${utils.escapeHTML(round)}</span>
                  <span class="badge">${utils.escapeHTML(quota)}</span>
                  <span class="badge">${utils.escapeHTML(cat)}</span>
                  <span class="badge">${utils.escapeHTML(gender)}</span>
                </div>
                <h3 style="margin: 0 0 4px; font-size: 1.15rem;">${utils.escapeHTML(inst)}</h3>
                <p class="rec-prog" style="margin: 0;">${utils.escapeHTML(prog)}</p>
              </div>
              <button type="button" class="btn btn-ghost btn-sm btn-sl-rm" data-id="${utils.escapeHTML(id)}" title="Remove from shortlist">
                ✕ Remove
              </button>
            </div>
            <div class="rank-pair" style="max-width: 380px;">
              <div class="rank-box">
                <small>Opening rank</small>
                <b>${open}</b>
              </div>
              <div class="rank-box">
                <small>Closing rank</small>
                <b>${close}</b>
              </div>
            </div>
            <div class="btn-row">
              <button type="button" class="btn btn-ghost btn-sm btn-sl-cmp" data-id="${utils.escapeHTML(id)}" aria-pressed="${isCmp ? "true" : "false"}">
                ${isCmp ? "✓ Comparing" : "+ Compare"}
              </button>
              <a class="btn btn-ghost btn-sm" href="#/college/${utils.escapeHTML(id)}">View Details</a>
            </div>
          </article>
        `;
      })
      .join("");

    container.innerHTML = `<div class="shortlist-list">${cardsHtml}</div>`;

    container.querySelectorAll(".btn-sl-rm").forEach((btn) => {
      btn.addEventListener("click", () => {
        store?.removeShortlist(btn.dataset.id);
      });
    });

    container.querySelectorAll(".btn-sl-cmp").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const rec = list.find((r) => String(r._id || r.id) === String(id));
        if (rec) {
          const nowCompared = store?.toggleComparison(rec);
          btn.setAttribute("aria-pressed", String(nowCompared));
          btn.innerHTML = nowCompared ? "✓ Comparing" : "+ Compare";
        }
      });
    });
  }

  // Hero rank form listener
  function initHeroRankForm() {
    const heroForm = $("hero-rank-form");
    const heroInput = $("hero-rank");
    const heroInst = $("hero-inst-type");

    heroForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = Number(heroInput?.value.trim());
      const instType = heroInst?.value || "NIT";
      const examName = instType === "IIT" ? "JEE Advanced" : "JEE Main";
      const examRankType = instType === "IIT" ? "JEE_ADVANCED" : "JEE_MAIN";

      if (!Number.isFinite(val) || val <= 0 || !Number.isInteger(val)) {
        utils?.toast("Please enter a valid positive integer rank.", "warn");
        heroInput?.focus();
        return;
      }

      // Populate explore rank and instituteType
      const exRank = $("ex-rank");
      if (exRank) exRank.value = val;
      const exType = $("ex-instituteType");
      if (exType) {
        exType.value = instType;
        exType.dispatchEvent(new Event("change"));
      }

      // Save into profile
      const currentProfile = store?.getProfile() || {};
      store?.saveProfile({
        ...currentProfile,
        rank: val,
        instituteType: instType,
        examRankType
      });

      utils?.toast(`${examName} Rank ${utils.formatNumber(val)} saved! Loading ${instType} cutoffs…`, "info");
      window.location.hash = "#/explore";
      window.CX.colleges?.loadCutoffs();
    });
  }

  // SPA Hash Router
  function route() {
    const rawHash = (location.hash || "#/home").replace(/^#\/?/, "");
    const parts = rawHash.split("/").filter(Boolean);
    let pageName = parts[0] || "home";
    const param = parts[1] || null;

    const isHow = pageName === "how";
    if (isHow) pageName = "home";

    // Validate page element exists
    let targetPageId = `page-${pageName}`;
    if (!$(targetPageId)) {
      targetPageId = "page-home";
      pageName = "home";
    }

    // Toggle pages
    document.querySelectorAll(".page").forEach((page) => {
      const match = page.id === targetPageId;
      page.hidden = !match;
    });

    // Update active nav links
    document.querySelectorAll(".nav-link").forEach((link) => {
      const linkRoute = link.getAttribute("data-route");
      const isCurrent = linkRoute === (isHow ? "how" : pageName);
      if (isCurrent) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    // Update document title
    const activeSection = $(targetPageId);
    const pageTitle = activeSection?.getAttribute("data-title") || "Home";
    document.title = `CounselX — ${pageTitle}`;

    // Handle special route scrolls and actions
    if (isHow) {
      const howSection = $("how");
      if (howSection) {
        howSection.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }

    // Route-specific triggers
    if (pageName === "college" && param) {
      window.CX.details?.load(param);
    } else if (pageName === "dashboard") {
      window.CX.dashboard?.load();
    } else if (pageName === "explore") {
      // Explore page
    } else if (pageName === "recommendations") {
      window.CX.recommendations?.load();
    } else if (pageName === "compare") {
      window.CX.comparison?.render();
    } else if (pageName === "shortlist") {
      renderShortlistPage();
    }

    // Set focus on page heading
    const h1 = activeSection?.querySelector("h1.page-title");
    if (h1 && !isHow) {
      h1.focus();
    }
  }

  function init() {
    initHeroRankForm();

    // Shortlist clear handler
    $("sl-clear")?.addEventListener("click", () => {
      store?.clearShortlist();
    });

    store?.subscribe("shortlistChanged", () => {
      if (!location.hash.includes("shortlist")) return;
      renderShortlistPage();
    });

    // Route on hashchange
    window.addEventListener("hashchange", route);
    route();

    // Check backend connection
    api?.checkBackend().then(
      (res) => console.log("CounselX backend online:", res),
      (err) => console.warn("CounselX backend connection warning:", err)
    );
  }

  document.addEventListener("DOMContentLoaded", init);

  window.CX.router = {
    route,
    navigate: (hash) => {
      window.location.hash = hash.startsWith("#") ? hash : `#/${hash}`;
    }
  };
})();
