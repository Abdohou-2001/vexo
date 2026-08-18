"use strict";

/**
 * VEXO HVAC - js/utils.js
 * Generic reusable utilities - no business logic, no Firebase, no auth
 * Lightweight, safe, vanilla JS
 * Can be reused by app.js, admin.js, auth.js later
 */

const VexoUtils = (() => {
  /* ==================================================
     1. DOM UTILITIES
  ================================================== */

  /**
   * Safe single element selector
   * @param {string} selector
   * @param {ParentNode} parent
   * @returns {Element|null}
   */
  const $ = (selector, parent = document) => {
    try {
      if (!selector || typeof selector !== "string") return null;
      return parent.querySelector(selector);
    } catch {
      return null;
    }
  };

  /**
   * Safe multiple elements selector
   * @param {string} selector
   * @param {ParentNode} parent
   * @returns {Element[]}
   */
  const $$ = (selector, parent = document) => {
    try {
      if (!selector || typeof selector !== "string") return [];
      return Array.from(parent.querySelectorAll(selector));
    } catch {
      return [];
    }
  };

  /**
   * Safe element creation - no innerHTML
   * @param {string} tag
   * @param {Object} options
   * @returns {HTMLElement|null}
   */
  const createElement = (tag, options = {}) => {
    try {
      if (!tag || typeof tag !== "string") return null;
      const el = document.createElement(tag);

      if (options.className) {
        el.className = options.className;
      }
      if (options.id) {
        el.id = options.id;
      }
      if (options.text) {
        el.textContent = options.text;
      }
      if (options.attrs && typeof options.attrs === "object") {
        Object.entries(options.attrs).forEach(([k, v]) => {
          if (v != null) el.setAttribute(k, String(v));
        });
      }
      if (options.children && Array.isArray(options.children)) {
        options.children.forEach((child) => {
          if (child instanceof HTMLElement) el.appendChild(child);
        });
      }
      return el;
    } catch {
      return null;
    }
  };

  /**
   * Check if element exists and is HTMLElement
   */
  const isElement = (el) => el instanceof HTMLElement;

  /* ==================================================
     2. STRING UTILITIES
  ================================================== */

  const isEmpty = (value) => {
    if (value == null) return true;
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  };

  const trim = (value) => {
    if (typeof value !== "string") return "";
    return value.trim();
  };

  const normalizeWhitespace = (value) => {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim();
  };

  const capitalize = (value) => {
    if (typeof value !== "string" || !value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  };

  const truncate = (value, maxLength = 100, suffix = "...") => {
    if (typeof value !== "string") return "";
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength - suffix.length).trim() + suffix;
  };

  /* ==================================================
     3. FORM / VALIDATION UTILITIES - generic only
  ================================================== */

  const isValidEmail = (email) => {
    if (typeof email !== "string") return false;
    const val = email.trim();
    if (!val) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const isValidPhone = (phone) => {
    if (typeof phone !== "string") return false;
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  };

  const getFormValues = (form) => {
    if (!(form instanceof HTMLFormElement)) return {};
    const data = {};
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        data[key] = value.trim();
      } else {
        data[key] = value;
      }
    }
    return data;
  };

  /* ==================================================
     4. NUMBER UTILITIES
  ================================================== */

  const toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const clamp = (value, min, max) => {
    const num = toNumber(value, min);
    return Math.min(Math.max(num, min), max);
  };

  const formatNumber = (value, options = {}) => {
    const num = toNumber(value, 0);
    try {
      return new Intl.NumberFormat(undefined, options).format(num);
    } catch {
      return String(num);
    }
  };

  /* ==================================================
     5. DATE UTILITIES - generic only
  ================================================== */

  const formatDate = (date, options = {}) => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...options,
      });
    } catch {
      return "";
    }
  };

  const formatDateTime = (date) => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString();
    } catch {
      return "";
    }
  };

  const isValidDate = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return d instanceof Date && !Number.isNaN(d.getTime());
  };

  /* ==================================================
     6. STORAGE UTILITIES - safe, non-sensitive only
  ================================================== */
  // IMPORTANT: Never store passwords, tokens, or sensitive PII

  const setStorage = (key, value) => {
    try {
      if (typeof key !== "string" || !key) return false;
      const toStore = typeof value === "string" ? value : JSON.stringify(value);
      localStorage.setItem(key, toStore);
      return true;
    } catch {
      return false;
    }
  };

  const getStorage = (key, fallback = null) => {
    try {
      if (typeof key !== "string" || !key) return fallback;
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch {
      return fallback;
    }
  };

  const removeStorage = (key) => {
    try {
      if (typeof key !== "string" || !key) return false;
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };

  /* ==================================================
     7. PERFORMANCE UTILITIES
  ================================================== */

  const debounce = (fn, delay = 300) => {
    if (typeof fn !== "function") return () => {};
    let timer = null;
    return function (...args) {
      const context = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fn.apply(context, args);
      }, delay);
    };
  };

  const throttle = (fn, limit = 300) => {
    if (typeof fn !== "function") return () => {};
    let inThrottle = false;
    return function (...args) {
      const context = this;
      if (!inThrottle) {
        fn.apply(context, args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  };

  /* ==================================================
     8. PUBLIC API
  ================================================== */
  return {
    // DOM
    $,
    $$,
    createElement,
    isElement,
    // String
    isEmpty,
    trim,
    normalizeWhitespace,
    capitalize,
    truncate,
    // Form
    isValidEmail,
    isValidPhone,
    getFormValues,
    // Number
    toNumber,
    clamp,
    formatNumber,
    // Date
    formatDate,
    formatDateTime,
    isValidDate,
    // Storage (non-sensitive)
    setStorage,
    getStorage,
    removeStorage,
    // Performance
    debounce,
    throttle,
  };
})();

// Expose globally for non-module setup - does not override existing
// Works with existing app.js that expects global helpers
if (typeof window !== "undefined") {
  window.VexoUtils = window.VexoUtils || VexoUtils;
  // Backward compatible short aliases if not already taken
  window.$v = window.$v || VexoUtils.$;
  window.$$v = window.$$v || VexoUtils.$$;
}

// Support ES module import if project migrates later
if (typeof module !== "undefined" && module.exports) {
  module.exports = VexoUtils;
}
