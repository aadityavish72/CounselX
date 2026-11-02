(function () {
  "use strict";

  window.CX = window.CX || {};

  const api = window.CX.api;
  const store = window.CX.store;
  const utils = window.CX.utils;

  const STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
    "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
  ];

  let currentStep = 1;

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

  async function loadProfileOptions() {
    try {
      const res = await api.getCutoffFilters();
      if (!res || !res.success || !res.filters) return;
      const f = res.filters;

      populateSelect("pf-rankType", f.rankTypes || ["CRL", "Category Rank"]);
      populateSelect("pf-seatCategory", f.seatCategories || ["OPEN", "OBC-NCL", "SC", "ST", "EWS"]);
      populateSelect("pf-year", f.years || [2026]);
      if (f.rounds) {
        const el = $("pf-round");
        if (el) {
          let html = '<option value="">Select round…</option>';
          f.rounds.forEach((r) => {
            html += `<option value="${r}">Round ${r}</option>`;
          });
          el.innerHTML = html;
        }
      }
      populateSelect("pf-quota", f.quotas || ["AI", "HS", "OS"]);
      populateSelect("pf-genderPool", f.genderPools || ["Gender-Neutral", "Female-only (including Supernumerary)"]);
      populateSelect("pf-instituteType", f.instituteTypes || ["IIT", "NIT"], "All institute types");
      populateSelect("pf-homeState", STATES, "Select state…");
      populateSelect("pf-location", STATES, "Any location");

      if (f.branches) {
        const dl = $("dl-branch");
        if (dl) {
          dl.innerHTML = f.branches.map((b) => `<option value="${utils.escapeHTML(b)}"></option>`).join("");
        }
      }

      loadSavedProfileIntoForm();
    } catch (err) {
      console.warn("Could not load profile options:", err);
    }
  }

  function loadSavedProfileIntoForm() {
    const p = store?.getProfile();
    if (!p) return;

    if (p.rank) $("pf-rank").value = p.rank;
    if (p.rankType) $("pf-rankType").value = p.rankType;
    if (p.seatCategory) $("pf-seatCategory").value = p.seatCategory;
    if (p.gender) $("pf-gender").value = p.gender;
    if (p.homeState) $("pf-homeState").value = p.homeState;

    if (p.year) $("pf-year").value = p.year;
    if (p.round) $("pf-round").value = p.round;
    if (p.quota) $("pf-quota").value = p.quota;
    if (p.genderPool) $("pf-genderPool").value = p.genderPool;
    if (p.instituteType) $("pf-instituteType").value = p.instituteType;
    if (p.branch) $("pf-branch").value = p.branch;
    if (p.fee) $("pf-fee").value = p.fee;
    if (p.location) $("pf-location").value = p.location;
  }

  function validateStep(step) {
    let isValid = true;

    function clearFieldError(id) {
      const el = $(`${id}-error`);
      if (el) el.textContent = "";
      $(`${id}`)?.removeAttribute("aria-invalid");
    }

    function setFieldError(id, msg) {
      const el = $(`${id}-error`);
      if (el) el.textContent = msg;
      $(`${id}`)?.setAttribute("aria-invalid", "true");
      isValid = false;
    }

    if (step === 1) {
      clearFieldError("pf-rank");
      clearFieldError("pf-rankType");
      clearFieldError("pf-seatCategory");
      clearFieldError("pf-gender");
      clearFieldError("pf-homeState");

      const rank = Number($("pf-rank")?.value);
      if (!Number.isFinite(rank) || rank < 1 || rank > 3000000 || !Number.isInteger(rank)) {
        setFieldError("pf-rank", "Please enter a valid integer rank between 1 and 3,000,000.");
      }

      if (!$("pf-rankType")?.value) {
        setFieldError("pf-rankType", "Please select a rank type (e.g. CRL).");
      }

      if (!$("pf-seatCategory")?.value) {
        setFieldError("pf-seatCategory", "Please select your seat category.");
      }

      if (!$("pf-gender")?.value) {
        setFieldError("pf-gender", "Please select your gender.");
      }

      if (!$("pf-homeState")?.value) {
        setFieldError("pf-homeState", "Please select your home state.");
      }
    }

    if (step === 2) {
      clearFieldError("pf-year");
      clearFieldError("pf-round");
      clearFieldError("pf-quota");
      clearFieldError("pf-genderPool");

      if (!$("pf-year")?.value) {
        setFieldError("pf-year", "Please select a counselling year.");
      }

      if (!$("pf-round")?.value) {
        setFieldError("pf-round", "Please select a JoSAA round.");
      }

      if (!$("pf-quota")?.value) {
        setFieldError("pf-quota", "Please select a quota preference.");
      }

      if (!$("pf-genderPool")?.value) {
        setFieldError("pf-genderPool", "Please select a gender pool.");
      }
    }

    return isValid;
  }

  function renderReview() {
    const review = $("profile-review");
    if (!review) return;

    const data = [
      ["JEE Rank", utils.formatNumber($("pf-rank")?.value)],
      ["Rank Type", $("pf-rankType")?.value],
      ["Seat Category", $("pf-seatCategory")?.value],
      ["Gender", $("pf-gender")?.value],
      ["Home State", $("pf-homeState")?.value],
      ["Counselling Year", $("pf-year")?.value],
      ["JoSAA Round", `Round ${$("pf-round")?.value}`],
      ["Quota", $("pf-quota")?.value],
      ["Gender Pool", $("pf-genderPool")?.value],
      ["Institute Type", $("pf-instituteType")?.value || "All Types"],
      ["Branch Preference", $("pf-branch")?.value || "Any Branch"],
      ["Annual Fee Budget", $("pf-fee")?.value ? `₹${utils.formatNumber($("pf-fee")?.value)}` : "Not specified"],
      ["Location Preference", $("pf-location")?.value || "Any location"]
    ];

    review.innerHTML = data
      .map(
        ([lbl, val]) => `
        <div>
          <dt>${utils.escapeHTML(lbl)}</dt>
          <dd>${utils.escapeHTML(val || "—")}</dd>
        </div>
      `
      )
      .join("");
  }

  function showStep(step) {
    currentStep = step;

    // Update panels
    document.querySelectorAll(".step-panel").forEach((panel) => {
      panel.hidden = Number(panel.dataset.panel) !== step;
    });

    // Update stepper header
    document.querySelectorAll("#stepper li").forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle("active", s === step);
      li.classList.toggle("done", s < step);
    });

    // Update buttons
    const backBtn = $("pf-back");
    const nextBtn = $("pf-next");

    if (backBtn) {
      backBtn.style.visibility = step === 1 ? "hidden" : "visible";
    }

    if (nextBtn) {
      if (step === 3) {
        nextBtn.textContent = "Save Profile";
      } else if (step === 4) {
        nextBtn.hidden = true;
        // In Step 4, show discovery links
        const panel4 = document.querySelector('[data-panel="4"]');
        if (panel4) {
          panel4.innerHTML = `
            <legend>Step 4 · Discover colleges</legend>
            <p>Your profile is saved in your browser. Choose how you'd like to explore:</p>
            <div class="btn-row" style="margin-top: 24px;">
              <a class="btn btn-primary btn-lg" href="#/recommendations">View Personalized Recommendations</a>
              <a class="btn btn-secondary btn-lg" href="#/explore">Explore All JoSAA Cutoffs</a>
              <button type="button" class="btn btn-ghost" id="pf-edit-again">Edit profile</button>
            </div>
          `;
          $("pf-edit-again")?.addEventListener("click", () => showStep(1));
        }
      } else {
        nextBtn.hidden = false;
        nextBtn.textContent = "Next";
      }
    }

    if (step === 3) {
      renderReview();
    }
  }

  function saveProfileFromForm() {
    const instType = $("pf-instituteType")?.value || "";
    const examRankType = instType === "IIT" ? "JEE_ADVANCED" : (instType ? "JEE_MAIN" : "");

    const profile = {
      rank: Number($("pf-rank")?.value),
      examRankType,
      rankType: $("pf-rankType")?.value,
      seatCategory: $("pf-seatCategory")?.value,
      gender: $("pf-gender")?.value,
      homeState: $("pf-homeState")?.value,
      year: Number($("pf-year")?.value),
      round: Number($("pf-round")?.value),
      quota: $("pf-quota")?.value,
      genderPool: $("pf-genderPool")?.value,
      instituteType: instType,
      branch: $("pf-branch")?.value,
      fee: $("pf-fee")?.value,
      location: $("pf-location")?.value,
      updatedAt: new Date().toISOString()
    };

    store?.saveProfile(profile);
    utils?.toast("Profile saved successfully!", "info");
  }

  function init() {
    loadProfileOptions();

    $("pf-next")?.addEventListener("click", () => {
      if (!validateStep(currentStep)) return;

      if (currentStep === 3) {
        saveProfileFromForm();
        showStep(4);
      } else {
        showStep(currentStep + 1);
      }
    });

    $("pf-back")?.addEventListener("click", () => {
      if (currentStep > 1) {
        showStep(currentStep - 1);
      }
    });

    // Auto-sync gender pool when gender changes
    $("pf-gender")?.addEventListener("change", (e) => {
      const gen = e.target.value;
      const gp = $("pf-genderPool");
      if (!gp) return;
      if (gen === "Female") {
        gp.value = "Female-only (including Supernumerary)";
      } else if (gen === "Male") {
        gp.value = "Gender-Neutral";
      }
    });

    showStep(1);
  }

  document.addEventListener("DOMContentLoaded", init);

  window.CX.profile = {
    showStep,
    loadSavedProfileIntoForm
  };
})();
