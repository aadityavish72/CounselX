(function () {
  "use strict";

  window.CX = window.CX || {};

  const utils = window.CX.utils;

  function statusBadge(status) {
    if (!status || status === "Insufficient data") return "";
    let cls = "badge";
    if (status.includes("Safe")) cls += " tier-safe";
    else if (status.includes("Target")) cls += " tier-target";
    else if (status.includes("Reach")) cls += " tier-reach";
    return `<span class="${cls}">${utils.escapeHTML(status)}</span>`;
  }

  function typeBadge(type) {
    if (!type) return "";
    return `<span class="badge badge-type">${utils.escapeHTML(type)}</span>`;
  }

  function initDialogs() {
    document.addEventListener("click", function (e) {
      const openBtn = e.target.closest("[data-dialog]");
      if (openBtn) {
        const dialogId = openBtn.getAttribute("data-dialog");
        const dlg = document.getElementById(dialogId);
        if (dlg && typeof dlg.showModal === "function") {
          dlg.showModal();
        }
        return;
      }

      const closeBtn = e.target.closest("[data-close]");
      if (closeBtn) {
        const dlg = closeBtn.closest("dialog");
        if (dlg && typeof dlg.close === "function") {
          dlg.close();
        }
        return;
      }
    });

    // Close when clicking dialog backdrop
    document.querySelectorAll("dialog").forEach((dlg) => {
      dlg.addEventListener("click", function (e) {
        const rect = dlg.getBoundingClientRect();
        const isInDialog =
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width;
        if (!isInDialog) {
          dlg.close();
        }
      });
    });
  }

  function initNavToggle() {
    const menuBtn = document.getElementById("menu-btn");
    const scrim = document.getElementById("scrim");
    const nav = document.getElementById("nav");

    function closeNav() {
      document.body.classList.remove("nav-open");
      if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
      if (scrim) scrim.hidden = true;
    }

    function toggleNav() {
      const isOpen = document.body.classList.toggle("nav-open");
      if (menuBtn) menuBtn.setAttribute("aria-expanded", String(isOpen));
      if (scrim) scrim.hidden = !isOpen;
    }

    menuBtn?.addEventListener("click", toggleNav);
    scrim?.addEventListener("click", closeNav);

    nav?.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        closeNav();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initDialogs();
    initNavToggle();
  });

  window.CX.components = {
    statusBadge,
    typeBadge
  };
})();
