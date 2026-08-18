"use strict";

/**
 * VEXO HVAC - admin/js/leads.js
 * Admin Leads Management Controller for admin/pages/leads.html
 * Uses /js/leads.js for data layer, /js/auth.js for auth, /js/utils.js for helpers
 * No Firebase re-init, no database.js, no auth duplication
 */

import { getLeads, updateLeadStatus, updateLead, deleteLead, getLead, LEAD_STATUSES } from "../../js/leads.js";
import { showToast, escapeHTML, formatDate, formatDateTime, debounce, $, $$ } from "../../js/utils.js";
import { CONFIG } from "../../js/config.js";

/* ==================================================
   STATE
================================================== */
const state = {
  allLeads: [],
  filteredLeads: [],
  loading: false,
  searchQuery: "",
  statusFilter: "all",
  dateFilter: "all",
  sortBy: "newest",
  selectedLeadId: null,
};

const STATUS_LIST = Array.isArray(LEAD_STATUSES) && LEAD_STATUSES.length? LEAD_STATUSES : ["new", "pending", "contacted", "completed", "cancelled"];

/* ==================================================
   DOM HELPERS - safe
================================================== */
function el(id) { try { return document.getElementById(id); } catch { return null; } }
function setText(id, v) { const e = el(id); if (e) e.textContent = String(v?? "0"); }
function showNode(node) { if (node) { node.style.display = ""; node.removeAttribute("hidden"); } }
function hideNode(node) { if (node) { node.style.display = "none"; } }

/* ==================================================
   AUTH - reuse existing auth.js
================================================== */
async function checkAuth() {
  try {
    if (window.VexoAuth && typeof window.VexoAuth.isAuthenticated === "function") {
      if (!window.VexoAuth.isAuthenticated()) { window.location.href = "../login.html"; return false; }
      return true;
    }
    try {
      const mod = await import("../../js/auth.js");
      if (mod && typeof mod.requireAuth === "function") return mod.requireAuth("../login.html");
      if (mod && typeof mod.isAuthenticated === "function") {
        if (!mod.isAuthenticated()) { window.location.href = "../login.html"; return false; }
        return true;
      }
    } catch {}
    const { auth } = await import("../../js/firebase.js");
    const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        if (!user) { window.location.href = "../login.html"; resolve(false); }
        else resolve(true);
      });
    });
  } catch {
    return true;
  }
}

/* ==================================================
   DATE FILTER HELPERS
================================================== */
function getLeadTime(lead) {
  try {
    if (lead.createdAt?.toDate) return lead.createdAt.toDate().getTime();
    if (lead.createdAt) return new Date(lead.createdAt).getTime();
    return 0;
  } catch { return 0; }
}

function passesDateFilter(lead, filter) {
  if (!filter || filter === "all") return true;
  const t = getLeadTime(lead);
  if (!t) return true;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (filter === "today") return now - t < day;
  if (filter === "7days") return now - t < 7 * day;
  if (filter === "30days") return now - t < 30 * day;
  return true;
}

/* ==================================================
   FILTER / SEARCH / SORT - local only
================================================== */
function applyFilters() {
  let list = [...state.allLeads];

  // Status filter
  const sf = (state.statusFilter || "all").toLowerCase();
  if (sf!== "all") {
    list = list.filter(l => (l.status || "new").toLowerCase() === sf);
  }

  // Date filter
  list = list.filter(l => passesDateFilter(l, state.dateFilter));

  // Search filter - client side
  const q = (state.searchQuery || "").toLowerCase().trim();
  if (q) {
    list = list.filter(l => {
      const hay = [
        l.name || "",
        l.phone || "",
        l.email || "",
        l.service || "",
        l.address || "",
        l.zip || "",
        l.message || "",
        l.city || "",
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // Sort - no firebase query
  if (state.sortBy === "newest") {
    list.sort((a, b) => getLeadTime(b) - getLeadTime(a));
  } else if (state.sortBy === "oldest") {
    list.sort((a, b) => getLeadTime(a) - getLeadTime(b));
  } else if (state.sortBy === "name-asc") {
    list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (state.sortBy === "name-desc") {
    list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  }

  state.filteredLeads = list;
}

function updateStatistics() {
  const all = state.allLeads;
  const counts = {};
  STATUS_LIST.forEach(s => counts[s] = 0);
  all.forEach(l => {
    const s = (l.status || "new").toLowerCase();
    if (counts[s]!== undefined) counts[s]++;
    else counts[s] = (counts[s] || 0) + 1;
  });

  setText("totalLeads", all.length);
  setText("newLeads", counts["new"] || 0);
  setText("pendingLeads", counts["pending"] || counts["new"] || 0);
  setText("contactedLeads", counts["contacted"] || 0);
  setText("completedLeads", counts["completed"] || counts["won"] || 0);
  setText("cancelledLeads", counts["cancelled"] || counts["lost"] || 0);

  // Generic total fallback
  const genericTotal = el("totalLeadsCount");
  if (genericTotal) genericTotal.textContent = String(all.length);
}

/* ==================================================
   RENDER TABLE
================================================== */
function showLoading() {
  state.loading = true;
  const loadingState = el("loadingState");
  const emptyState = el("emptyState");
  const errorState = el("errorState");
  const table = el("leadsTable");
  const tbody = el("leadsTableBody") || el("leadsList");
  if (loadingState) showNode(loadingState);
  if (emptyState) hideNode(emptyState);
  if (errorState) hideNode(errorState);
  if (table) table.style.opacity = "0.5";
  if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="padding:32px;text-align:center;">Loading leads...</td></tr>`;
}

function showEmpty() {
  state.loading = false;
  const loadingState = el("loadingState");
  const emptyState = el("emptyState");
  const errorState = el("errorState");
  const table = el("leadsTable");
  const tbody = el("leadsTableBody") || el("leadsList");
  if (loadingState) hideNode(loadingState);
  if (errorState) hideNode(errorState);
  if (emptyState) showNode(emptyState);
  if (table) table.style.opacity = "1";
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" style="padding:48px 16px;text-align:center;"><div style="font-weight:700;margin-bottom:6px;">No leads yet</div><div style="font-size:14px;opacity:.7;">New customer inquiries will appear here.</div></td></tr>`;
  }
}

function showError(message = "Unable to load leads. Please try again.") {
  state.loading = false;
  const loadingState = el("loadingState");
  const errorState = el("errorState");
  const table = el("leadsTable");
  if (loadingState) hideNode(loadingState);
  if (errorState) {
    showNode(errorState);
    const msgEl = errorState.querySelector("[data-error-msg]") || errorState;
    if (msgEl) {
      const textNode = errorState.querySelector("p") || msgEl;
      if (textNode && textNode!== errorState) textNode.textContent = message;
      else if (errorState.firstChild) errorState.textContent = message;
    }
  }
  if (table) table.style.opacity = "1";
  showToast(message, 3000);
}

function renderLeads() {
  const tbody = el("leadsTableBody") || el("leadsList");
  const table = el("leadsTable");
  const loadingState = el("loadingState");
  const emptyState = el("emptyState");
  const errorState = el("errorState");

  if (loadingState) hideNode(loadingState);
  if (errorState) hideNode(errorState);

  const list = state.filteredLeads;

  if (!tbody) {
    state.loading = false;
    if (!list.length) { if (emptyState) showNode(emptyState); }
    else { if (emptyState) hideNode(emptyState); }
    return;
  }

  if (!list.length) {
    if (state.allLeads.length === 0) {
      showEmpty();
    } else {
      tbody.innerHTML = `<tr><td colspan="9" style="padding:32px;text-align:center;">No leads match your search / filter.</td></tr>`;
      if (table) table.style.opacity = "1";
      if (emptyState) hideNode(emptyState);
    }
    updateStatistics();
    state.loading = false;
    return;
  }

  if (emptyState) hideNode(emptyState);
  if (table) table.style.opacity = "1";

  tbody.innerHTML = "";
  list.forEach((lead) => {
    const tr = document.createElement("tr");
    tr.dataset.leadId = lead.id;

    const nameTd = document.createElement("td");
    nameTd.className = "cell-name";
    nameTd.textContent = lead.name || "-";

    const phoneTd = document.createElement("td");
    phoneTd.innerHTML = `<a href="tel:${escapeHTML(lead.phone || "")}" class="admin-link">${escapeHTML(lead.phone || "-")}</a>`;

    const emailTd = document.createElement("td");
    emailTd.textContent = lead.email || "-";

    const serviceTd = document.createElement("td");
    serviceTd.textContent = lead.service || "-";

    const locationTd = document.createElement("td");
    locationTd.textContent = lead.address || lead.zip || lead.city || "-";

    const messageTd = document.createElement("td");
    messageTd.className = "cell-message";
    const msg = (lead.message || "").toString();
    messageTd.textContent = msg.length > 60? msg.slice(0, 60) + "…" : (msg || "-");
    messageTd.title = msg;

    const statusTd = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `admin-badge status-${(lead.status || "new").toLowerCase()} badge-${(lead.status || "new").toLowerCase()}`;
    badge.textContent = lead.status || "new";
    statusTd.appendChild(badge);

    const dateTd = document.createElement("td");
    const rawDate = lead.createdAt?.toDate? lead.createdAt.toDate() : lead.createdAt;
    try {
      dateTd.textContent = rawDate? formatDate(rawDate) : "-";
      dateTd.title = rawDate? formatDateTime(rawDate) : "";
    } catch { dateTd.textContent = "-"; }

    const actionsTd = document.createElement("td");
    actionsTd.className = "cell-actions";
    actionsTd.innerHTML = `
      <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="view" data-id="${lead.id}">View</button>
      <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="delete" data-id="${lead.id}" aria-label="Delete lead ${escapeHTML(lead.name || "")}">Delete</button>
    `;

    // Append in expected order: Name, Phone, Email, Service, Location/Message, Status, Date, Actions
    // Support both layouts - use 9 columns max
    tr.append(nameTd, phoneTd, emailTd, serviceTd, locationTd, messageTd, statusTd, dateTd, actionsTd);
    tbody.appendChild(tr);
  });

  updateStatistics();
  state.loading = false;
}

/* ==================================================
   LEAD DETAILS MODAL
================================================== */
function openLeadDetails(leadId) {
  const lead = state.allLeads.find(l => l.id === leadId);
  if (!lead) return;
  state.selectedLeadId = leadId;

  const modal = el("leadModal");
  const content = el("leadModalContent");
  if (!modal ||!content) return;

  const rawDate = lead.createdAt?.toDate? lead.createdAt.toDate() : lead.createdAt;
  let dateStr = "-";
  try { dateStr = rawDate? formatDateTime(rawDate) : "-"; } catch {}

  // Build safe content without innerHTML for user data where possible
  content.innerHTML = "";
  const fields = [
    ["Name", lead.name || "-"],
    ["Phone", lead.phone || "-"],
    ["Email", lead.email || "-"],
    ["Service", lead.service || "-"],
    ["Location", lead.address || lead.zip || lead.city || "-"],
    ["Preferred Date", lead.preferredDate || "-"],
    ["Preferred Time", lead.preferredTime || "-"],
    ["Source", lead.source || "website"],
    ["Status", lead.status || "new"],
    ["Date", dateStr],
    ["Message", lead.message || "-"],
    ["Notes", lead.notes || "-"],
  ];

  fields.forEach(([label, val]) => {
    const row = document.createElement("div");
    row.className = "admin-detail-row";
    const l = document.createElement("div");
    l.className = "admin-detail-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "admin-detail-value";
    v.textContent = val;
    row.append(l, v);
    content.appendChild(row);
  });

  // Status update controls inside modal
  const statusWrap = document.createElement("div");
  statusWrap.className = "admin-detail-actions";
  statusWrap.innerHTML = `
    <label class="admin-label" for="leadStatusSelect">Update Status</label>
    <div style="display:flex;gap:8px;margin-top:6px;">
      <select id="leadStatusSelect" class="admin-input" style="height:40px;">
        ${STATUS_LIST.map(s => `<option value="${s}" ${s===lead.status?'selected':''}>${s}</option>`).join("")}
      </select>
      <button type="button" class="admin-btn admin-btn-primary" id="saveLeadStatusBtn">Save</button>
    </div>
  `;
  content.appendChild(statusWrap);

  const saveBtn = content.querySelector("#saveLeadStatusBtn");
  const select = content.querySelector("#leadStatusSelect");
  if (saveBtn && select) {
    saveBtn.addEventListener("click", async () => {
      const newStatus = select.value;
      if (!STATUS_LIST.includes(newStatus)) return;
      try {
        saveBtn.disabled = true;
        await updateLeadStatus(lead.id, newStatus);
        lead.status = newStatus;
        lead.updatedAt = new Date();
        applyFilters();
        renderLeads();
        showToast(`Status updated to ${newStatus}`, 2500);
        // Update badge in modal
      } catch (err) {
        showToast("Unable to update this lead.", 3000);
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  modal.style.display = "grid";
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLeadModal() {
  const modal = el("leadModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("open");
  document.body.style.overflow = "";
  state.selectedLeadId = null;
}

/* ==================================================
   LOAD LEADS - uses existing /js/leads.js
================================================== */
async function loadLeads() {
  if (state.loading) return;
  showLoading();
  try {
    const leads = await getLeads({ limit: 100 });
    state.allLeads = Array.isArray(leads)? leads : [];
    applyFilters();
    if (state.allLeads.length === 0) {
      showEmpty();
    } else {
      renderLeads();
    }
  } catch (err) {
    console.warn("[admin/leads.js] loadLeads failed:", err?.message || err);
    showError("Unable to load leads. Please try again.");
  }
}

/* ==================================================
   EVENT LISTENERS
================================================== */
function setupEventListeners() {
  // Search with debounce
  const searchInput = el("leadSearch") || $('[data-search="leads"]');
  if (searchInput &&!searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    const handler = debounce(() => {
      state.searchQuery = searchInput.value || "";
      applyFilters();
      renderLeads();
    }, 250);
    searchInput.addEventListener("input", handler);
  }

  // Status filter
  const statusFilter = el("statusFilter") || $('[data-filter-status]');
  if (statusFilter &&!statusFilter.dataset.bound) {
    statusFilter.dataset.bound = "1";
    statusFilter.addEventListener("change", (e) => {
      state.statusFilter = e.target.value || "all";
      applyFilters();
      renderLeads();
    });
  }

  // Date filter
  const dateFilter = el("dateFilter");
  if (dateFilter &&!dateFilter.dataset.bound) {
    dateFilter.dataset.bound = "1";
    dateFilter.addEventListener("change", (e) => {
      state.dateFilter = e.target.value || "all";
      applyFilters();
      renderLeads();
    });
  }

  // Sort
  const sortSelect = el("sortLeads") || el("sortBy");
  if (sortSelect &&!sortSelect.dataset.bound) {
    sortSelect.dataset.bound = "1";
    sortSelect.addEventListener("change", (e) => {
      state.sortBy = e.target.value || "newest";
      applyFilters();
      renderLeads();
    });
  }

  // Refresh
  const refreshBtn = el("refreshLeads");
  if (refreshBtn &&!refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", async () => {
      if (state.loading) return;
      refreshBtn.disabled = true;
      refreshBtn.setAttribute("aria-busy", "true");
      await loadLeads();
      refreshBtn.disabled = false;
      refreshBtn.removeAttribute("aria-busy");
      showToast("Leads refreshed", 2000);
    });
  }

  // Table delegation - view / delete
  const tbody = el("leadsTableBody") || el("leadsList");
  if (tbody &&!tbody.dataset.bound) {
    tbody.dataset.bound = "1";
    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      if (action === "view") {
        openLeadDetails(id);
      } else if (action === "delete") {
        const lead = state.allLeads.find(l => l.id === id);
        const confirmMsg = lead? `Delete lead "${lead.name || id}"? This cannot be undone.` : "Delete this lead? This cannot be undone.";
        if (!window.confirm(confirmMsg)) return;
        try {
          btn.disabled = true;
          await deleteLead(id);
          state.allLeads = state.allLeads.filter(l => l.id!== id);
          applyFilters();
          renderLeads();
          showToast("Lead deleted", 2500);
        } catch (err) {
          showToast("Unable to delete this lead.", 3000);
          btn.disabled = false;
        }
      }
    });
  }

  // Modal close
  const closeModalBtn = el("closeLeadModal") || $('[data-close-modal="leadModal"]');
  if (closeModalBtn &&!closeModalBtn.dataset.bound) {
    closeModalBtn.dataset.bound = "1";
    closeModalBtn.addEventListener("click", closeLeadModal);
  }
  const modalOverlay = el("leadModal");
  if (modalOverlay &&!modalOverlay.dataset.bound) {
    modalOverlay.dataset.bound = "1";
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeLeadModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLeadModal();
  });
}

/* ==================================================
   INIT
================================================== */
async function init() {
  const ok = await checkAuth();
  if (!ok) return;
  setupEventListeners();
  await loadLeads();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { loadLeads, renderLeads, openLeadDetails };
