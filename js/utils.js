(function () {
  "use strict";

  window.CX = window.CX || {};

  const utils = {
    escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, function (char) {
        const entities = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        };

        return entities[char];
      });
    },

    formatNumber(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return "—";
      }

      return number.toLocaleString("en-IN");
    },

    getElement(id) {
      return document.getElementById(id);
    },

    setText(id, value) {
      const element = document.getElementById(id);

      if (element) {
        element.textContent = value ?? "";
      }
    },

    show(element, visible = true) {
      if (typeof element === "string") {
        element = document.getElementById(element);
      }
      if (element) {
        element.hidden = !visible;
      }
    },

    reducedMotion() {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (e) {
        return false;
      }
    },

    toast(message, type = "info", duration = 3500) {
      const container = document.getElementById("toasts");
      if (!container) return;

      const toast = document.createElement("div");
      toast.className = `toast${type === "error" ? " error" : type === "warn" ? " warn" : ""}`;
      toast.setAttribute("role", "status");
      toast.textContent = message;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s ease";
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    classifyHistoricalCutoff(studentRank, closingRank) {
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
        return "Safe";
      }

      if (rank <= cutoff) {
        return "Target";
      }

      return "Reach";
    },

    debounce(fn, delay = 250) {
      let timeoutId;
      return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
      };
    }
  };

  window.CX.utils = utils;
  window.classifyHistoricalCutoff = utils.classifyHistoricalCutoff;
})();
