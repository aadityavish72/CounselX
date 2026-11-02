(function () {
  "use strict";

  window.CX = window.CX || {};

  const STORAGE_KEYS = {
    PROFILE: "cx_user_profile",
    SHORTLIST: "cx_shortlist_records",
    COMPARISON: "cx_compare_records",
    RECENT: "cx_recently_viewed"
  };

  const listeners = new Map();

  function subscribe(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    return () => listeners.get(event).delete(callback);
  }

  function emit(event, data) {
    if (listeners.has(event)) {
      listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Store listener error for ${event}:`, err);
        }
      });
    }
  }

  function getJSON(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      console.warn(`Failed to read ${key} from localStorage:`, e);
      return fallback;
    }
  }

  function setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to write ${key} to localStorage:`, e);
    }
  }

  // Profile
  function getProfile() {
    return getJSON(STORAGE_KEYS.PROFILE, null);
  }

  function saveProfile(profile) {
    setJSON(STORAGE_KEYS.PROFILE, profile);
    emit("profileChanged", profile);
  }

  function clearProfile() {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    emit("profileChanged", null);
  }

  // Shortlist
  function getShortlist() {
    return getJSON(STORAGE_KEYS.SHORTLIST, []);
  }

  function isShortlisted(id) {
    const list = getShortlist();
    return list.some((item) => String(item._id || item.id) === String(id));
  }

  function addShortlist(record) {
    if (!record) return false;
    const id = record._id || record.id;
    const list = getShortlist();
    if (list.some((item) => String(item._id || item.id) === String(id))) {
      return false;
    }
    list.push(record);
    setJSON(STORAGE_KEYS.SHORTLIST, list);
    updateBadges();
    emit("shortlistChanged", list);
    if (window.CX.utils?.toast) {
      window.CX.utils.toast("Added to My List", "info");
    }
    return true;
  }

  function removeShortlist(id) {
    const list = getShortlist().filter(
      (item) => String(item._id || item.id) !== String(id)
    );
    setJSON(STORAGE_KEYS.SHORTLIST, list);
    updateBadges();
    emit("shortlistChanged", list);
    if (window.CX.utils?.toast) {
      window.CX.utils.toast("Removed from My List", "info");
    }
    return true;
  }

  function toggleShortlist(record) {
    if (!record) return false;
    const id = record._id || record.id;
    if (isShortlisted(id)) {
      removeShortlist(id);
      return false;
    } else {
      addShortlist(record);
      return true;
    }
  }

  function clearShortlist() {
    setJSON(STORAGE_KEYS.SHORTLIST, []);
    updateBadges();
    emit("shortlistChanged", []);
    if (window.CX.utils?.toast) {
      window.CX.utils.toast("Shortlist cleared", "info");
    }
  }

  // Comparison (up to 4 records)
  function getComparison() {
    return getJSON(STORAGE_KEYS.COMPARISON, []);
  }

  function isCompared(id) {
    const list = getComparison();
    return list.some((item) => String(item._id || item.id) === String(id));
  }

  function addComparison(record) {
    if (!record) return false;
    const id = record._id || record.id;
    const list = getComparison();
    if (list.some((item) => String(item._id || item.id) === String(id))) {
      return false;
    }
    if (list.length >= 4) {
      if (window.CX.utils?.toast) {
        window.CX.utils.toast("You can compare up to 4 colleges at a time.", "warn");
      }
      return false;
    }
    list.push(record);
    setJSON(STORAGE_KEYS.COMPARISON, list);
    updateBadges();
    emit("comparisonChanged", list);
    if (window.CX.utils?.toast) {
      window.CX.utils.toast(`Added to comparison (${list.length}/4)`, "info");
    }
    return true;
  }

  function removeComparison(id) {
    const list = getComparison().filter(
      (item) => String(item._id || item.id) !== String(id)
    );
    setJSON(STORAGE_KEYS.COMPARISON, list);
    updateBadges();
    emit("comparisonChanged", list);
    return true;
  }

  function toggleComparison(record) {
    if (!record) return false;
    const id = record._id || record.id;
    if (isCompared(id)) {
      removeComparison(id);
      return false;
    } else {
      return addComparison(record);
    }
  }

  function clearComparison() {
    setJSON(STORAGE_KEYS.COMPARISON, []);
    updateBadges();
    emit("comparisonChanged", []);
  }

  // Recently viewed
  function getRecent() {
    return getJSON(STORAGE_KEYS.RECENT, []);
  }

  function addRecent(record) {
    if (!record) return;
    const id = record._id || record.id;
    let list = getRecent().filter(
      (item) => String(item._id || item.id) !== String(id)
    );
    list.unshift(record);
    if (list.length > 10) list = list.slice(0, 10);
    setJSON(STORAGE_KEYS.RECENT, list);
    emit("recentChanged", list);
  }

  // Update navbar badges and compare tray
  function updateBadges() {
    const sl = getShortlist();
    const slBadge = document.getElementById("badge-shortlist");
    if (slBadge) {
      slBadge.textContent = String(sl.length);
      slBadge.hidden = sl.length === 0;
    }

    const cmp = getComparison();
    const cmpBadge = document.getElementById("badge-compare");
    if (cmpBadge) {
      cmpBadge.textContent = String(cmp.length);
      cmpBadge.hidden = cmp.length === 0;
    }

    const tray = document.getElementById("compare-tray");
    const trayText = document.getElementById("compare-tray-text");
    if (tray && trayText) {
      if (cmp.length > 0) {
        trayText.textContent = `${cmp.length} college${cmp.length > 1 ? "s" : ""} selected to compare`;
        tray.hidden = false;
      } else {
        tray.hidden = true;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", updateBadges);

  window.CX.store = {
    subscribe,
    emit,
    getProfile,
    saveProfile,
    clearProfile,
    getShortlist,
    isShortlisted,
    addShortlist,
    removeShortlist,
    toggleShortlist,
    clearShortlist,
    getComparison,
    isCompared,
    addComparison,
    removeComparison,
    toggleComparison,
    clearComparison,
    getRecent,
    addRecent,
    updateBadges
  };
})();
