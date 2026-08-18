"use strict";

/**
 * VEXO HVAC - js/utils.js
 * Generic reusable utilities - ES Module
 * No Firebase, no Auth, no Firestore, no Admin logic, no business logic
 * Safe, lightweight, production-ready
 */

/* ==================================================
   1. DOM HELPERS
================================================== */

/**
 * Safe querySelector - returns null if invalid
 * @param {string} selector
 * @param {ParentNode} parent
 * @returns {Element|null}
 */
export function $(selector, parent = document) {
  try {
    if (!selector || typeof selector!== "string") return null;
    return parent.querySelector(selector);
  } catch {
    return null;
  }
}

/**
 * Safe querySelectorAll - returns array always
 * @param {string} selector
 * @param {ParentNode} parent
 * @returns {Element[]}
 */
export function $$(selector, parent = document) {
  try {
    if (!selector || typeof selector!== "string") return [];
    return Array.from(parent.querySelectorAll(selector));
  } catch {
    return [];
  }
}

/**
 * Check if value is HTMLElement
 */
export function isElement(el) {
  return el instanceof HTMLElement;
}

/**
 * Safe class helpers
 */
export function addClass(el, className) {
  if (isElement(el) && className) el.classList.add(className);
}

export function removeClass(el, className) {
  if (isElement(el) && className) el.classList.remove(className);
}

export function toggleClass(el, className, force) {
  if (!isElement(el) ||!className) return false;
  return el.classList.toggle(className, force);
}

export function hasClass(el, className) {
  if (!isElement(el) ||!className) return false;
  return el.classList.contains(className);
}

/* ==================================================
   2. STRING HELPERS
================================================== */

/**
 * Escape HTML to prevent XSS - use textContent preferred, but helper available
 */
export function escapeHTML(str) {
  if (typeof str!== "string") return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Truncate text safely
 */
export function truncateText(str, maxLength = 100, suffix = "...") {
  if (typeof str!== "string") return "";
  if (str.length <= maxLength) return str;
  return str.slice(0, Math.max(0, maxLength - suffix.length)).trim() + suffix;
}

/**
 * Capitalize first letter
 */
export function capitalize(str) {
  if (typeof str!== "string" ||!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Normalize text: trim + collapse whitespace + lowercase optional
 */
export function normalizeText(str, toLower = true) {
  if (typeof str!== "string") return "";
  let out = str.replace(/\s+/g, " ").trim();
  return toLower? out.toLowerCase() : out;
}

/* ==================================================
   3. VALIDATION - generic only
================================================== */

export function isRequired(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function isValidEmail(email) {
  if (typeof email!== "string") return false;
  const v = email.trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isValidPhone(phone) {
  if (typeof phone!== "string") return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/* ==================================================
   4. NUMBER / CURRENCY - USD default for US market
================================================== */

/**
 * Format number safely
 */
export function formatNumber(value, options = {}) {
  const num = Number(value);
  const safe = Number.isFinite(num)? num : 0;
  try {
    return new Intl.NumberFormat(undefined, options).format(safe);
  } catch {
    return String(safe);
  }
}

/**
 * Format currency - USD default
 * @param {number} value
 * @param {string} currency - e.g., USD
 * @param {string} locale - e.g., en-US
 */
export function formatCurrency(value, currency = "USD", locale = "en-US") {
  const num = Number(value);
  const safe = Number.isFinite(num)? num : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

/* ==================================================
   5. DATE / TIME - safe invalid handling
================================================== */

export function formatDate(date, options = {}) {
  try {
    const d = date instanceof Date? date : new Date(date);
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
}

export function formatDateTime(date, options = {}) {
  try {
    const d = date instanceof Date? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
     ...options,
    });
  } catch {
    return "";
  }
}

export function getRelativeTime(date) {
  try {
    const d = date instanceof Date? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    const sec = Math.round(diff / 1000);
    const min = Math.round(sec / 60);
    const hour = Math.round(min / 60);
    const day = Math.round(hour / 24);

    if (sec < 60) return "just now";
    if (min < 60) return `${min}m ago`;
    if (hour < 24) return `${hour}h ago`;
    if (day < 7) return `${day}d ago`;
    return formatDate(d);
  } catch {
    return "";
  }
}

export function isValidDate(date) {
  const d = date instanceof Date? date : new Date(date);
  return d instanceof Date &&!Number.isNaN(d.getTime());
}

/* ==================================================
   6. ID / DATA HELPERS
================================================== */

export function generateId(prefix = "v") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

export function isObject(value) {
  return value!== null && typeof value === "object" &&!Array.isArray(value);
}

export function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function safeParseJSON(str, fallback = null) {
  try {
    if (typeof str!== "string") return fallback;
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function safeStringifyJSON(value, fallback = "") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/* ==================================================
   7. PERFORMANCE
================================================== */

export function debounce(fn, delay = 300) {
  if (typeof fn!== "function") return () => {};
  let timer = null;
  return function (...args) {
    const ctx = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(ctx, args), delay);
  };
}

export function throttle(fn, limit = 300) {
  if (typeof fn!== "function") return () => {};
  let inThrottle = false;
  return function (...args) {
    const ctx = this;
    if (!inThrottle) {
      fn.apply(ctx, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/* ==================================================
   8. UI HELPERS - works with existing.toast
================================================== */

let _toastTimeout = null;

/**
 * Show toast using existing.toast element in index.html
 * Fails gracefully if toast does not exist
 */
export function showToast(message = "", duration = 2600) {
  const toast = document.getElementById("toast") || $(".toast") || $(".admin-toast");
  if (!isElement(toast)) return false;

  // Safety: use textContent, no innerHTML
  toast.textContent = String(message || "");

  addClass(toast, "show");

  if (_toastTimeout) clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => {
    hideToast();
  }, duration);

  return true;
}

export function hideToast() {
  const toast = document.getElementById("toast") || $(".toast") || $(".admin-toast");
  if (!isElement(toast)) return false;
  removeClass(toast, "show");
  if (_toastTimeout) {
    clearTimeout(_toastTimeout);
    _toastTimeout = null;
  }
  return true;
}

/**
 * Set loading state on button
 * Preserves accessibility
 */
export function setLoading(button, isLoading = true, loadingText = "Loading...") {
  if (!isElement(button)) return;
  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent || "";
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

/* ==================================================
   9. ERROR HANDLING - safe, no sensitive leak
================================================== */

export function logError(message, error, context = {}) {
  // Development only logging - never expose secrets
  const safeContext = {};
  try {
    Object.entries(context).forEach(([k, v]) => {
      if (typeof v === "string" && v.length < 200) safeContext[k] = v;
    });
  } catch {}

  if (typeof console!== "undefined" && console.warn) {
    console.warn(`[VexoUtils] ${message}`, error?.message || error, safeContext);
  }
}

export function getSafeErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (typeof error === "string" && error.length < 300) return error;
  if (error && typeof error.message === "string" && error.message.length < 300) {
    // Avoid leaking Firebase internal details
    if (error.message.toLowerCase().includes("api key")) return fallback;
    if (error.message.toLowerCase().includes("private")) return fallback;
    return error.message;
  }
  return fallback;
}

/* ==================================================
   10. STORAGE HELPERS - safe JSON, non-sensitive only
   SECURITY: Never store passwords, private keys, tokens
================================================== */

export function setStorage(key, value) {
  try {
    if (typeof key!== "string" ||!key) return false;
    const lower = key.toLowerCase();
    // Block sensitive keys
    if (lower.includes("password") || lower.includes("private") || lower.includes("secret") || lower.includes("token") || lower.includes("api_key") || lower.includes("apikey")) {
      logError("Blocked sensitive key from localStorage", null, { key });
      return false;
    }
    const toStore = typeof value === "string"? value : safeStringifyJSON(value, "");
    localStorage.setItem(key, toStore);
    return true;
  } catch (err) {
    logError("setStorage failed", err, { key });
    return false;
  }
}

export function getStorage(key, fallback = null) {
  try {
    if (typeof key!== "string" ||!key) return fallback;
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = safeParseJSON(raw, null);
    return parsed!== null? parsed : raw;
  } catch (err) {
    logError("getStorage failed", err, { key });
    return fallback;
  }
}

export function removeStorage(key) {
  try {
    if (typeof key!== "string" ||!key) return false;
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    logError("removeStorage failed", err, { key });
    return false;
  }
}

/* ==================================================
   11. ASYNC HELPERS
================================================== */

export function sleep(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
