"use strict";

/**
 * VEXO HVAC - admin/js/services.js
 * Services Admin Controller for admin/pages/services.html
 * Reuses /js/firebase.js, /js/auth.js, /js/storage.js, /js/utils.js, /js/settings.js
 * No database.js, no Firebase re-init
 */

import { db } from "../../js/firebase.js";
import { showToast, escapeHTML, debounce, $, $$ } from "../../js/utils.js";
import { uploadFileWithUniqueName, validateImage, STORAGE_FOLDERS, buildPath, deleteFileByPath } from "../../js/storage.js";
import { getCompanySettings, updateAvailableServices } from "../../js/settings.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ==================================================
   STATE
================================================== */
const state = {
  services: [],
  filtered: [],
  loading: false,
  editingId: null,
  search: "",
  statusFilter: "all",
  categoryFilter: "all",
  sortBy: "order",
  uploading: false,
};

const SERVICES_COLLECTION = "services";
const DEFAULT_CATEGORIES = ["Repair", "Installation", "Maintenance", "Air Quality", "Emergency", "Heating"];

/* ==================================================
   DOM HELPERS
================================================== */
function el(id) { try { return document.getElementById(id); } catch { return null; } }
function setText(id, v) { const e = el(id); if (e) e.textContent = String(v?? "0"); }
function showNode(n) { if (n) { n.style.display = ""; n.removeAttribute("hidden"); } }
function hideNode(n) { if (n) { n.style.display = "none"; } }

/* ==================================================
   AUTH
================================================== */
async function checkAuth() {
  try {
    if (window.VexoAuth?.isAuthenticated) {
      if (!window.VexoAuth.isAuthenticated()) { window.location.href = "../login.html"; return false; }
      return true;
    }
    try {
      const mod = await import("../../js/auth.js");
      if (mod.requireAuth) return mod.requireAuth("../login.html");
      if (mod.isAuthenticated &&!mod.isAuthenticated()) { window.location.href = "../login.html"; return false; }
    } catch {}
    const { auth } = await import("../../js/firebase.js");
    const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => { unsub(); if (!u) { window.location.href = "../login.html"; resolve(false); } else resolve(true); });
    });
  } catch { return true; }
}

/* ==================================================
   UTILITIES
================================================== */
function slugify(str) {
  if (!str || typeof str!== "string") return "";
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function sanitize(str, max = 500) {
  if (typeof str!== "string") return "";
  let v = str.replace(/\s+/g, " ").trim();
  if (v.length > max) v = v.slice(0, max).trim();
  return v;
}

function getTime(item) {
  try {
    if (item.createdAt?.toDate) return item.createdAt.toDate().getTime();
    if (item.createdAt) return new Date(item.createdAt).getTime();
    return 0;
  } catch { return 0; }
}

/* ==================================================
   LOAD SERVICES - Firestore primary, settings fallback, json seed fallback
================================================== */
async function loadServices() {
  if (state.loading) return;
  state.loading = true;
  showLoadingState();
  try {
    let list = [];

    // 1) Try Firestore services collection
    try {
      const colRef = collection(db, SERVICES_COLLECTION);
      const q = query(colRef, orderBy("order", "asc"));
      const snap = await getDocs(q);
      snap.forEach(d => list.push({ id: d.id,...d.data() }));
    } catch (e) {
      // If order field missing, fallback to unordered
      try {
        const colRef = collection(db, SERVICES_COLLECTION);
        const snap = await getDocs(colRef);
        list = [];
        snap.forEach(d => list.push({ id: d.id,...d.data() }));
      } catch {}
    }

    // 2) If empty, fallback to settings.company availableServices
    if (!list.length) {
      try {
        const settings = await getCompanySettings();
        if (Array.isArray(settings.availableServices) && settings.availableServices.length) {
          list = settings.availableServices.map((s, i) => ({
            id: s.id || slugify(s.name) || `svc-${i}`,
            name: s.name,
            slug: s.slug || slugify(s.name),
            category: s.category || "General",
            shortDescription: s.shortDescription || s.description || "",
            description: s.description || "",
            active: s.active!== false,
            featured:!!s.featured,
            order: s.order?? i,
            image: s.image || s.imageUrl || "",
            icon: s.icon || "",
            fromSettings: true,
          }));
        }
      } catch {}
    }

    // 3) If still empty, try /data/services.json seed
    if (!list.length) {
      try {
        const res = await fetch("../../data/services.json");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) {
            list = json.map((s, i) => ({
              id: s.id || slugify(s.name) || `svc-${i}`,
              name: s.name,
              slug: s.slug || slugify(s.name),
             ...s,
              active: s.active!== false,
              order: s.order?? i,
            }));
          }
        }
      } catch {}
    }

    state.services = list;
    applyFilters();
    renderServices();
  } catch (err) {
    console.warn("[services.js] loadServices failed:", err?.message || err);
    showErrorState("Unable to load services. Please try again.");
  } finally {
    state.loading = false;
  }
}

function showLoadingState() {
  const ls = el("loadingState");
  const es = el("emptyState");
  const err = el("errorState");
  const list = el("servicesList") || el("servicesTableBody") || el("servicesTable");
  if (ls) showNode(ls);
  if (es) hideNode(es);
  if (err) hideNode(err);
  if (list && list.tagName === "TBODY") list.innerHTML = `<tr><td colspan="7" style="padding:32px;text-align:center;">Loading services...</td></tr>`;
}

function showEmptyState() {
  const ls = el("loadingState");
  const es = el("emptyState");
  const err = el("errorState");
  const tbody = el("servicesTableBody") || el("servicesList");
  if (ls) hideNode(ls);
  if (err) hideNode(err);
  if (es) showNode(es);
  if (tbody && tbody.tagName === "TBODY") tbody.innerHTML = `<tr><td colspan="7" style="padding:48px 16px;text-align:center;">No services found.<br><span style="opacity:.6;font-size:13px;">Add your first HVAC service to display on the website.</span></td></tr>`;
}

function showErrorState(msg = "Unable to load services. Please try again.") {
  const ls = el("loadingState");
  const err = el("errorState");
  if (ls) hideNode(ls);
  if (err) { showNode(err); const p = err.querySelector("p") || err; if (p!== err) p.textContent = msg; }
  showToast(msg, 3000);
}

/* ==================================================
   FILTER / SEARCH / SORT
================================================== */
function applyFilters() {
  let list = [...state.services];

  if (state.statusFilter!== "all") {
    const active = state.statusFilter === "active";
    list = list.filter(s => (s.active!== false) === active);
  }

  if (state.categoryFilter!== "all") {
    list = list.filter(s => (s.category || "General").toLowerCase() === state.categoryFilter.toLowerCase());
  }

  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(s => [s.name || "", s.category || "", s.shortDescription || "", s.description || ""].join(" ").toLowerCase().includes(q));
  }

  if (state.sortBy === "order") list.sort((a, b) => (a.order?? 999) - (b.order?? 999));
  else if (state.sortBy === "newest") list.sort((a, b) => getTime(b) - getTime(a));
  else if (state.sortBy === "oldest") list.sort((a, b) => getTime(a) - getTime(b));
  else if (state.sortBy === "name-asc") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else if (state.sortBy === "name-desc") list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));

  state.filtered = list;
}

function updateStatistics() {
  const all = state.services;
  const active = all.filter(s => s.active!== false).length;
  const inactive = all.length - active;
  const featured = all.filter(s => s.featured).length;
  setText("totalServices", all.length);
  setText("activeServices", active);
  setText("inactiveServices", inactive);
  setText("featuredServices", featured);
}

/* ==================================================
   RENDER
================================================== */
function renderServices() {
  const listEl = el("servicesList");
  const tbody = el("servicesTableBody");
  const table = el("servicesTable");
  const loading = el("loadingState");
  const empty = el("emptyState");
  const err = el("errorState");

  if (loading) hideNode(loading);
  if (err) hideNode(err);

  if (!state.filtered.length) {
    if (!state.services.length) { showEmptyState(); }
    else {
      if (listEl) listEl.innerHTML = `<div style="padding:24px;text-align:center;opacity:.7;">No services match search / filter.</div>`;
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:32px;text-align:center;">No matching services.</td></tr>`;
      if (empty) hideNode(empty);
    }
    updateStatistics();
    return;
  }

  if (empty) hideNode(empty);

  // Card / list render
  if (listEl &&!tbody) {
    listEl.innerHTML = "";
    state.filtered.forEach(s => {
      const card = document.createElement("div");
      card.className = "admin-service-card";
      card.dataset.id = s.id;
      const img = s.image || s.imageUrl || "";
      card.innerHTML = `
        <div class="admin-service-card-img">${img? `<img src="${escapeHTML(img)}" alt="${escapeHTML(s.name || "")}" loading="lazy" />` : `<div class="admin-service-placeholder">🔧</div>`}</div>
        <div class="admin-service-card-body">
          <h3 class="admin-service-name">${escapeHTML(s.name || "")}</h3>
          <p class="admin-service-meta">${escapeHTML(s.category || "General")} • Order ${s.order?? 0} ${s.featured? '• Featured' : ''}</p>
          <p class="admin-service-desc">${escapeHTML((s.shortDescription || s.description || "").slice(0, 120))}</p>
          <div class="admin-service-actions">
            <span class="admin-badge ${s.active!== false? 'admin-badge-success' : 'admin-badge-muted'}">${s.active!== false? 'Active' : 'Inactive'}</span>
            <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="edit" data-id="${s.id}">Edit</button>
            <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="toggle" data-id="${s.id}">${s.active!== false? 'Deactivate' : 'Activate'}</button>
            <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="delete" data-id="${s.id}">Delete</button>
          </div>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  // Table render
  if (tbody) {
    tbody.innerHTML = "";
    state.filtered.forEach(s => {
      const tr = document.createElement("tr");
      tr.dataset.id = s.id;
      const img = s.image || s.imageUrl || "";
      tr.innerHTML = `
        <td class="cell-img">${img? `<img src="${escapeHTML(img)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;" />` : '—'}</td>
        <td>${escapeHTML(s.name || "")}${s.featured? ' <span class="admin-badge badge-featured" style="margin-left:6px;">★</span>' : ''}</td>
        <td>${escapeHTML(s.category || "General")}</td>
        <td><span class="admin-badge ${s.active!== false? 'admin-badge-success' : 'admin-badge-muted'}">${s.active!== false? 'Active' : 'Inactive'}</span></td>
        <td>${s.featured? 'Yes' : 'No'}</td>
        <td>${s.order?? 0}</td>
        <td class="cell-actions">
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="edit" data-id="${s.id}">Edit</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="toggle" data-id="${s.id}">${s.active!== false? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="delete" data-id="${s.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (table) table.style.opacity = "1";
  updateStatistics();
}

/* ==================================================
   FORM HANDLING
================================================== */
function getFormData() {
  const name = sanitize(el("serviceName")?.value || "", 80);
  let slug = sanitize(el("serviceSlug")?.value || "", 80) || slugify(name);
  const shortDescription = sanitize(el("serviceShortDescription")?.value || "", 200);
  const description = sanitize(el("serviceDescription")?.value || "", 2000);
  const category = sanitize(el("serviceCategory")?.value || "General", 40);
  const icon = sanitize(el("serviceIcon")?.value || "", 100);
  const orderRaw = el("serviceOrder")?.value;
  const order = orderRaw!== "" && orderRaw!== undefined? parseInt(orderRaw, 10) : state.services.length;
  const active = el("serviceActive")? el("serviceActive").checked : true;
  const featured = el("serviceFeatured")? el("serviceFeatured").checked : false;
  const imageUrl = el("serviceImageUrl")?.value?.trim() || el("serviceImage")?.dataset?.url || "";

  return { name, slug, shortDescription, description, category, icon, order: Number.isFinite(order)? order : 0, active, featured, image: imageUrl };
}

function validateForm(data) {
  const errors = [];
  if (!data.name || data.name.length < 2) errors.push("Service name required (min 2).");
  if (data.slug &&!/^[a-z0-9-]+$/.test(data.slug)) errors.push("Slug must be lowercase alphanumeric + dash.");
  if (data.order < 0 || data.order > 1000) errors.push("Order must be 0-1000.");
  return errors;
}

function resetForm() {
  const form = el("serviceForm");
  if (form) form.reset();
  state.editingId = null;
  const preview = el("serviceImagePreview");
  if (preview) { preview.src = ""; preview.style.display = "none"; }
  const urlInput = el("serviceImageUrl");
  if (urlInput && urlInput.dataset) delete urlInput.dataset.url;
  const modal = el("serviceModal") || el("serviceFormModal");
  if (modal) { modal.style.display = "none"; modal.classList.remove("open"); document.body.style.overflow = ""; }
}

function openAddService() {
  resetForm();
  state.editingId = null;
  const modal = el("serviceModal") || el("serviceFormModal") || el("addServiceModal");
  if (modal) { modal.style.display = "grid"; modal.classList.add("open"); document.body.style.overflow = "hidden"; }
}

function openEditService(id) {
  const svc = state.services.find(s => s.id === id);
  if (!svc) return;
  state.editingId = id;
  if (el("serviceName")) el("serviceName").value = svc.name || "";
  if (el("serviceSlug")) el("serviceSlug").value = svc.slug || slugify(svc.name || "");
  if (el("serviceShortDescription")) el("serviceShortDescription").value = svc.shortDescription || "";
  if (el("serviceDescription")) el("serviceDescription").value = svc.description || "";
  if (el("serviceCategory")) el("serviceCategory").value = svc.category || "General";
  if (el("serviceIcon")) el("serviceIcon").value = svc.icon || "";
  if (el("serviceOrder")) el("serviceOrder").value = svc.order?? 0;
  if (el("serviceActive")) el("serviceActive").checked = svc.active!== false;
  if (el("serviceFeatured")) el("serviceFeatured").checked =!!svc.featured;
  if (el("serviceImageUrl")) el("serviceImageUrl").value = svc.image || svc.imageUrl || "";
  const preview = el("serviceImagePreview");
  if (preview && (svc.image || svc.imageUrl)) {
    preview.src = svc.image || svc.imageUrl;
    preview.style.display = "block";
  }
  const modal = el("serviceModal") || el("serviceFormModal") || el("addServiceModal");
  if (modal) { modal.style.display = "grid"; modal.classList.add("open"); document.body.style.overflow = "hidden"; }
}

async function saveService() {
  const data = getFormData();
  const errs = validateForm(data);
  if (errs.length) { showToast(errs[0], 3000); return; }

  const saveBtn = el("saveServiceBtn") || el("serviceSaveBtn") || document.querySelector("[data-action='save-service']");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.setAttribute("aria-busy", "true"); }

  try {
    const payload = {
      name: data.name,
      slug: data.slug,
      shortDescription: data.shortDescription || data.description.slice(0, 120),
      description: data.description,
      category: data.category,
      icon: data.icon,
      image: data.image,
      imageUrl: data.image,
      active: data.active,
      featured: data.featured,
      order: data.order,
      updatedAt: serverTimestamp(),
    };

    if (!state.editingId) {
      payload.createdAt = serverTimestamp();
      // Firestore primary
      try {
        const colRef = collection(db, SERVICES_COLLECTION);
        const docRef = await addDoc(colRef, payload);
        state.services.push({ id: docRef.id,...payload, order: data.order });
      } catch {
        // If Firestore not allowed, fallback to settings array
        const current = state.services;
        const newItem = { id: data.slug || `svc-${Date.now()}`,...payload, createdAt: new Date(), updatedAt: new Date() };
        current.push(newItem);
        try { await updateAvailableServices(current.map(c => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, category: c.category, active: c.active, featured: c.featured, order: c.order, image: c.image }))); } catch {}
        state.services = current;
      }
      showToast("Service added successfully.", 2500);
    } else {
      const id = state.editingId;
      // Try Firestore
      try {
        const docRef = doc(db, SERVICES_COLLECTION, id);
        await updateDoc(docRef, payload);
      } catch {
        // Try settings fallback
        try {
          const updated = state.services.map(s => s.id === id? {...s,...payload, updatedAt: new Date() } : s);
          await updateAvailableServices(updated.map(c => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, category: c.category, active: c.active, featured: c.featured, order: c.order, image: c.image })));
        } catch {}
      }
      state.services = state.services.map(s => s.id === id? {...s,...payload, updatedAt: new Date() } : s);
      showToast("Service updated successfully.", 2500);
    }

    resetForm();
    applyFilters();
    renderServices();
  } catch (err) {
    console.warn("[services.js] saveService failed:", err?.message || err);
    showToast("Unable to save service.", 3000);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.removeAttribute("aria-busy"); }
  }
}

async function deleteService(id) {
  const svc = state.services.find(s => s.id === id);
  if (!svc) return;
  if (!window.confirm(`Are you sure you want to delete "${svc.name}"? This cannot be undone.`)) return;

  try {
    try {
      await deleteDoc(doc(db, SERVICES_COLLECTION, id));
    } catch {
      // Settings fallback removal
      try {
        const updated = state.services.filter(s => s.id!== id);
        await updateAvailableServices(updated.map(c => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, category: c.category, active: c.active, featured: c.featured, order: c.order, image: c.image })));
      } catch {}
    }

    // Only delete storage image if explicitly stored under services/ and user confirmed
    if (svc.image && svc.image.includes("firebasestorage") && svc.image.includes(STORAGE_FOLDERS.services)) {
      try {
        const pathMatch = svc.image.match(/services%2F[^?]+/) || svc.image.match(/services\/[^?]+/);
        if (pathMatch) {
          const decodedPath = decodeURIComponent(pathMatch[0]);
          await deleteFileByPath(decodedPath).catch(() => {});
        }
      } catch {}
    }

    state.services = state.services.filter(s => s.id!== id);
    applyFilters();
    renderServices();
    showToast("Service deleted successfully.", 2500);
  } catch (err) {
    console.warn("[services.js] deleteService failed:", err?.message || err);
    showToast("Unable to delete this service.", 3000);
  }
}

async function toggleServiceStatus(id) {
  const svc = state.services.find(s => s.id === id);
  if (!svc) return;
  const newActive =!(svc.active!== false);
  try {
    const payload = { active: newActive, updatedAt: serverTimestamp() };
    try { await updateDoc(doc(db, SERVICES_COLLECTION, id), payload); } catch {}
    try {
      const updated = state.services.map(s => s.id === id? {...s, active: newActive } : s);
      await updateAvailableServices(updated.map(c => ({ id: c.id, name: c.name, active: c.active, slug: c.slug, description: c.description, category: c.category, featured: c.featured, order: c.order, image: c.image })));
    } catch {}
    svc.active = newActive;
    applyFilters();
    renderServices();
    showToast(`Service ${newActive? "activated" : "deactivated"}.`, 2000);
  } catch (err) {
    showToast("Unable to update service status.", 3000);
  }
}

async function toggleFeatured(id) {
  const svc = state.services.find(s => s.id === id);
  if (!svc) return;
  const newFeatured =!svc.featured;
  try {
    try { await updateDoc(doc(db, SERVICES_COLLECTION, id), { featured: newFeatured, updatedAt: serverTimestamp() }); } catch {}
    svc.featured = newFeatured;
    applyFilters();
    renderServices();
    showToast(newFeatured? "Marked as featured." : "Removed from featured.", 2000);
  } catch {
    showToast("Unable to update featured status.", 3000);
  }
}

/* ==================================================
   IMAGE UPLOAD - uses storage.js
================================================== */
async function handleImageUpload(file) {
  if (!file) return;
  const validation = validateImage(file);
  if (!validation.valid) { showToast(validation.error, 3000); return; }

  const preview = el("serviceImagePreview");
  const urlInput = el("serviceImageUrl") || el("serviceImage");

  // Local preview first
  try {
    if (preview) {
      const localUrl = URL.createObjectURL(file);
      preview.src = localUrl;
      preview.style.display = "block";
    }
  } catch {}

  state.uploading = true;
  const uploadBtn = el("uploadServiceImageBtn") || el("serviceImageUploadBtn");
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = "Uploading..."; }

  try {
    const result = await uploadFileWithUniqueName(file, STORAGE_FOLDERS.services);
    if (preview) { preview.src = result.url; preview.style.display = "block"; }
    if (urlInput) {
      if (urlInput.tagName === "INPUT") urlInput.value = result.url;
      urlInput.dataset = urlInput.dataset || {};
      urlInput.dataset.url = result.url;
      urlInput.dataset.path = result.path;
    }
    showToast("Image uploaded.", 2000);
  } catch (err) {
    console.warn("[services.js] image upload failed:", err?.message || err);
    showToast("Image upload failed.", 3000);
  } finally {
    state.uploading = false;
    if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = "Upload Image"; }
  }
}

/* ==================================================
   EVENTS
================================================== */
function setupEventListeners() {
  const searchInput = el("serviceSearch");
  if (searchInput &&!searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    searchInput.addEventListener("input", debounce(() => { state.search = searchInput.value || ""; applyFilters(); renderServices(); }, 250));
  }

  const statusFilter = el("statusFilter");
  if (statusFilter &&!statusFilter.dataset.bound) {
    statusFilter.dataset.bound = "1";
    statusFilter.addEventListener("change", e => { state.statusFilter = e.target.value || "all"; applyFilters(); renderServices(); });
  }

  const categoryFilter = el("categoryFilter");
  if (categoryFilter &&!categoryFilter.dataset.bound) {
    categoryFilter.dataset.bound = "1";
    categoryFilter.addEventListener("change", e => { state.categoryFilter = e.target.value || "all"; applyFilters(); renderServices(); });
  }

  const sortBy = el("sortServices") || el("sortBy");
  if (sortBy &&!sortBy.dataset.bound) {
    sortBy.dataset.bound = "1";
    sortBy.addEventListener("change", e => { state.sortBy = e.target.value || "order"; applyFilters(); renderServices(); });
  }

  const refreshBtn = el("refreshServices");
  if (refreshBtn &&!refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", async () => {
      if (state.loading) return;
      refreshBtn.disabled = true;
      refreshBtn.setAttribute("aria-busy", "true");
      await loadServices();
      refreshBtn.disabled = false;
      refreshBtn.removeAttribute("aria-busy");
      showToast("Services refreshed", 2000);
    });
  }

  const addBtn = el("addServiceBtn") || document.querySelector("[data-action='add-service']");
  if (addBtn &&!addBtn.dataset.bound) {
    addBtn.dataset.bound = "1";
    addBtn.addEventListener("click", openAddService);
  }

  const saveBtn = el("saveServiceBtn") || el("serviceSaveBtn");
  if (saveBtn &&!saveBtn.dataset.bound) {
    saveBtn.dataset.bound = "1";
    saveBtn.addEventListener("click", e => { e.preventDefault(); saveService(); });
  }

  const form = el("serviceForm");
  if (form &&!form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", e => { e.preventDefault(); saveService(); });
  }

  const cancelBtn = el("cancelServiceBtn") || el("closeServiceModal") || document.querySelector("[data-close-modal='serviceModal']");
  if (cancelBtn &&!cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = "1";
    cancelBtn.addEventListener("click", resetForm);
  }

  const modal = el("serviceModal") || el("serviceFormModal") || el("addServiceModal");
  if (modal &&!modal.dataset.bound) {
    modal.dataset.bound = "1";
    modal.addEventListener("click", e => { if (e.target === modal) resetForm(); });
  }

  const imageInput = el("serviceImageFile") || el("serviceImageInput");
  if (imageInput &&!imageInput.dataset.bound) {
    imageInput.dataset.bound = "1";
    imageInput.addEventListener("change", e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); });
  }

  const uploadBtn = el("uploadServiceImageBtn");
  if (uploadBtn &&!uploadBtn.dataset.bound) {
    uploadBtn.dataset.bound = "1";
    uploadBtn.addEventListener("click", () => { el("serviceImageFile")?.click(); });
  }

  // Delegation for table/cards
  const listRoot = el("servicesList") || el("servicesTableBody") || el("servicesTable");
  if (listRoot &&!listRoot.dataset.bound) {
    listRoot.dataset.bound = "1";
    listRoot.addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;
      if (action === "edit") openEditService(id);
      else if (action === "delete") deleteService(id);
      else if (action === "toggle") toggleServiceStatus(id);
      else if (action === "featured") toggleFeatured(id);
    });
  }

  document.addEventListener("keydown", e => { if (e.key === "Escape") resetForm(); });

  // Auto-slug from name if slug empty
  const nameInput = el("serviceName");
  const slugInput = el("serviceSlug");
  if (nameInput && slugInput &&!nameInput.dataset.slugBound) {
    nameInput.dataset.slugBound = "1";
    nameInput.addEventListener("blur", () => { if (!slugInput.value) slugInput.value = slugify(nameInput.value); });
  }
}

/* ==================================================
   INIT
================================================== */
async function init() {
  const ok = await checkAuth();
  if (!ok) return;
  setupEventListeners();
  await loadServices();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { loadServices, renderServices, openAddService, openEditService };
