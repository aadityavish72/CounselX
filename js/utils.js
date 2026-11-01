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
      if (element) {
        element.hidden = !visible;
      }
    }
  };

  window.CX.utils = utils;
})();