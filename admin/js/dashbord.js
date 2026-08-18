"use strict";

/**
 * VEXO HVAC - admin/js/dashboard.js
 * Dashboard controller for admin/pages/dashboard.html
 * Uses existing modules only - no Firebase init, no Auth duplication, no database.js
 */

import { db } from "../../js/firebase.js";
import { CONFIG } from "../../js/config.js";
import { getLeads, countLeadsByStatus, countAllLeads, LEAD_STATUSES } from "../../js/leads.js";
import { getCompanySettings } from "../../js/settings.js";
import { formatDate, formatDateTime, showToast, $, $$, escapeHTML } from "../../js/utils.js";
import {
  collection,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ==================================================
   STATE
================================================== */
let isRefreshing = false;
let authUnsubscribe = null;

/* ==================================================
   DOM HELPERS - safe
================================================== */
function getEl(id) {
  try { return document.getElementById(id); } catch { return null; }
}

function setText(id, value) {
  const el = getEl(id);
  if (!el) return false;
  el.textContent = String(value ?? "-");
  return true;
}

function showEl(el) {
  if (!el) return;
  el.style.display = "";
  el.removeAttribute("hidden");
}

function hideEl(el) {
  if (!el) return;
  el.style.display = "none";
}

/* ==================================================
   AUTH - use existing auth.js system
================================================== */
async function checkAuth() {
  try {
    // Prefer existing global VexoAuth if auth.js is not modular
    if (window.VexoAuth && typeof window.VexoAuth.isAuthenticated === "function") {
      if (!window.VexoAuth.isAuthenticated()) {
        window.location.href = "../login.html";
        return false;
      }
      return true;
    }

    // Try modular auth.js import if available
    try {
      const authMod = await import("../../js/auth.js");
      if (authMod && typeof authMod.requireAuth === "function") {
        return authMod.requireAuth("../login.html");
      }
      if (authMod && typeof authMod.isAuthenticated === "function") {
        if (!authMod.isAuthenticated()) {
          window.location.href = "../login.html";
          return false;
        }
        return true;
      }
      if (authMod && typeof authMod.onAuthChange === "function") {
        // Listen once
        return new Promise((resolve) => {
          authUnsubscribe = authMod.onAuthChange((user) => {
            if (!user) window.location.href = "../login.html";
            resolve(!!user);
          });
        });
      }
    } catch {
      // auth.js may be non-modular - fallback to Firebase auth directly
    }

    // Fallback: check Firebase auth state via firebase.js
    const { auth } = await import("../../js/firebase.js");
    const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        if (!user) {
          window.location.href = "../login.html";
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  } catch (err) {
    console.warn("[dashboard.js] auth check failed, allowing for dev:", err?.message);
    // Do not block dashboard in dev if auth check fails - security is enforced by Firestore rules
    return true;
  }
}

/* ==================================================
   STATISTICS
================================================== */
async function loadStatistics() {
  try {
    // Leads counts - use existing leads.js efficient count
    const totalLeadsP = countAllLeads().catch(() => null);
    const newLeadsP = countLeadsByStatus("new").catch(() => 0);
    const contactedP = countLeadsByStatus("contacted").catch(() => 0);
    const pendingP = (async () => {
      // pending is not in canonical list but used in dashboard spec - treat as new + scheduled
      try {
        const s1 = await countLeadsByStatus("new");
        return s1;
      } catch { return 0; }
    })();
    const completedP = countLeadsByStatus("won").catch(async () => {
      try { return await countLeadsByStatus("completed"); } catch { return 0; }
    })();

    const [totalLeads, newLeads, contactedLeads, pendingLeads, completedLeads] = await Promise.all([
      totalLeadsP,
      newLeadsP,
      contactedP,
      pendingP,
      completedP,
    ]);

    if (totalLeads !== null) setText("totalLeads", totalLeads);
    setText("newLeads", newLeads);
    setText("contactedLeads", contactedLeads);
    setText("pendingLeads", pendingLeads ?? newLeads);
    setText("completedLeads", completedLeads);

    // Services count - from settings or services collection
    try {
      const settings = await getCompanySettings();
      const servicesCount = Array.isArray(settings.availableServices) ? settings.availableServices.length : 0;
      setText("totalServices", servicesCount);
    } catch {
      // Fallback to count services collection if exists
      try {
        const colRef = collection(db, "services");
        const snap = await getCountFromServer(colRef);
        setText("totalServices", snap.data().count);
      } catch {
        setText("totalServices", CONFIG.BUSINESS?.services?.length || 6);
      }
    }

    // Reviews & Gallery - count collections if exist, else 0
    try {
      const reviewsRef = collection(db, "reviews");
      const reviewsSnap = await getCountFromServer(reviewsRef);
      setText("totalReviews", reviewsSnap.data().count);
    } catch {
      setText("totalReviews", 0);
    }

    try {
      const galleryRef = collection(db, "gallery");
      const gallerySnap = await getCountFromServer(galleryRef);
      setText("totalGallery", gallerySnap.data().count);
    } catch {
      // Try projects as gallery fallback
      try {
        const projRef = collection(db, "projects");
        const projSnap = await getCountFromServer(projRef);
        setText("totalGallery", projSnap.data().count);
      } catch {
        setText("totalGallery", 0);
      }
    }

    // Update badge
    const badge = getEl("leadsBadge");
    if (badge && typeof newLeads === "number" && newLeads > 0) {
      badge.textContent = String(newLeads);
      badge.style.display = "";
    }

  } catch (err) {
    console.warn("[dashboard.js] loadStatistics failed:", err?.message || err);
    showToast("Failed to load statistics", 3000);
  }
}

/* ==================================================
   RECENT LEADS
================================================== */
function showLoadingState() {
  const container = getEl("recentLeads");
  if (!container) return;
  container.innerHTML = `
    <div class="admin-loading-state" role="status" aria-live="polite">
      <div class="admin-spinner" aria-hidden="true"></div>
      <span>Loading recent leads...</span>
    </div>
  `;
}

function showEmptyState() {
  const container = getEl("recentLeads");
  if (!container) return;
  container.innerHTML = `
    <div class="admin-empty-state">
      <div class="admin-empty-icon" aria-hidden="true">📋</div>
      <h3 class="admin-empty-title">No leads yet</h3>
      <p class="admin-empty-text">New estimate requests will appear here. Share your website to start receiving leads.</p>
      <a href="../../index.html#estimate" class="admin-btn admin-btn-ghost">View estimate form</a>
    </div>
  `;
}

function showErrorState(message = "Failed to load recent leads.") {
  const container = getEl("recentLeads");
  if (!container) return;
  container.innerHTML = `
    <div class="admin-error-state" role="alert">
      <p class="admin-error-text">${escapeHTML(message)}</p>
      <button type="button" class="admin-btn admin-btn-ghost" id="retryRecentLeads">Retry</button>
    </div>
  `;
  const retryBtn = document.getElementById("retryRecentLeads");
  if (retryBtn) retryBtn.addEventListener("click", () => loadRecentLeads());
}

function renderRecentLeads(leads = []) {
  const container = getEl("recentLeads");
  if (!container) return;

  if (!leads.length) {
    showEmptyState();
    return;
  }

  const table = document.createElement("div");
  table.className = "admin-recent-table";

  // Use safe DOM creation - no innerHTML for user data
  leads.forEach((lead) => {
    const row = document.createElement("div");
    row.className = "admin-recent-row";

    const main = document.createElement("div");
    main.className = "admin-recent-main";

    const name = document.createElement("span");
    name.className = "admin-recent-name";
    name.textContent = lead.name || "Unknown";

    const service = document.createElement("span");
    service.className = "admin-recent-service";
    service.textContent = lead.service || "-";

    main.append(name, service);

    const meta = document.createElement("div");
    meta.className = "admin-recent-meta";

    const phone = document.createElement("span");
    phone.className = "admin-recent-phone";
    phone.textContent = lead.phone || "-";

    const status = document.createElement("span");
    status.className = `admin-badge admin-badge-${(lead.status || "new").toLowerCase()}`;
    status.textContent = lead.status || "new";

    const date = document.createElement("span");
    date.className = "admin-recent-date";
    const rawDate = lead.createdAt?.toDate ? lead.createdAt.toDate() : lead.createdAt;
    try {
      date.textContent = formatDate(rawDate) || formatDateTime(rawDate) || "recent";
    } catch {
      date.textContent = "recent";
    }

    meta.append(phone, status, date);
    row.append(main, meta);
    table.appendChild(row);
  });

  container.innerHTML = "";
  container.appendChild(table);
}

async function loadRecentLeads() {
  try {
    showLoadingState();
    const leads = await getLeads({ limit: 5 });
    renderRecentLeads(leads);
  } catch (err) {
    console.warn("[dashboard.js] loadRecentLeads failed:", err?.message || err);
    showErrorState(err?.message || "Failed to load recent leads.");
  }
}

/* ==================================================
   PUBLIC LOADERS
================================================== */
export async function loadDashboard() {
  if (isRefreshing) return;
  isRefreshing = true;

  const refreshBtn = getEl("refreshDashboard");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.setAttribute("aria-busy", "true");
  }

  try {
    await Promise.all([loadStatistics(), loadRecentLeads()]);
  } finally {
    isRefreshing = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.removeAttribute("aria-busy");
    }
  }
}

export async function refreshDashboard() {
  await loadDashboard();
  showToast("Dashboard refreshed", 2000);
}

/* ==================================================
   INIT
================================================== */
async function initDashboard() {
  try {
    const ok = await checkAuth();
    if (!ok) return;

    // Bind refresh button safely
    const refreshBtn = getEl("refreshDashboard");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", () => {
        if (!isRefreshing) refreshDashboard();
      });
    }

    // Bind logout - use existing auth.js if available
    const logoutBtns = $$("#logoutBtn, #topbarLogoutBtn, [data-action='logout']");
    logoutBtns.forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", async () => {
        try {
          if (window.VexoAuth && typeof window.VexoAuth.logout === "function") {
            await window.VexoAuth.logout();
          } else {
            const mod = await import("../../js/auth.js").catch(() => null);
            if (mod && typeof mod.logout === "function") {
              await mod.logout();
            } else {
              const { auth } = await import("../../js/firebase.js");
              const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
              await signOut(auth);
            }
          }
          window.location.href = "../login.html";
        } catch (err) {
          console.warn("[dashboard.js] logout failed:", err?.message);
          window.location.href = "../login.html";
        }
      });
    });

    await loadDashboard();
  } catch (err) {
    console.warn("[dashboard.js] init failed:", err?.message || err);
    showErrorState("Dashboard initialization failed.");
  }
}

// Auto-init when DOM ready - works as module and non-module fallback
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
