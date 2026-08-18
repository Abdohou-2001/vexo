"use strict";

/**
 * VEXO HVAC - admin/js/gallery.js
 * Gallery Admin Controller for admin/pages/gallery.html
 * Uses /js/firebase.js, /js/storage.js, /js/utils.js
 * No database.js, no Firebase re-init
 */

import { db } from "../../js/firebase.js";
import { showToast, escapeHTML, debounce } from "../../js/utils.js";
import { uploadFileWithUniqueName, validateImage, STORAGE_FOLDERS } from "../../js/storage.js";
import {
  collection,
  doc,
  getDocs,
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
  items: [],
  filtered: [],
  loading: false,
  editingId: null,
  search: "",
  statusFilter: "all",
  categoryFilter: "all",
  featuredFilter: "all",
  sortBy: "newest",
  uploading: false,
};

const GALLERY_COLLECTION = "gallery";
const FALLBACK_COLLECTION = "projects";

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
function sanitize(str, max = 1000) {
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
   LOAD GALLERY
================================================== */
async function loadGallery() {
  if (state.loading) return;
  state.loading = true;
  showLoadingState();
  try {
    let list = [];
    try {
      const colRef = collection(db, GALLERY_COLLECTION);
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      snap.forEach(d => list.push({ id: d.id,...d.data() }));
    } catch {
      try {
        const colRef = collection(db, GALLERY_COLLECTION);
        const snap = await getDocs(colRef);
        list = [];
        snap.forEach(d => list.push({ id: d.id,...d.data() }));
      } catch {}
    }

    if (!list.length) {
      try {
        const colRef = collection(db, FALLBACK_COLLECTION);
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        snap.forEach(d => list.push({ id: d.id,...d.data(), _fallback: true }));
      } catch {
        try {
          const colRef = collection(db, FALLBACK_COLLECTION);
          const snap = await getDocs(colRef);
          list = [];
          snap.forEach(d => list.push({ id: d.id,...d.data(), _fallback: true }));
        } catch {}
      }
    }

    state.items = list;
    applyFilters();
    renderGallery();
  } catch (err) {
    console.warn("[gallery.js] loadGallery failed:", err?.message || err);
    showErrorState("Unable to load gallery. Please try again.");
  } finally {
    state.loading = false;
  }
}

function showLoadingState() {
  const ls = el("loadingState");
  const es = el("emptyState");
  const err = el("errorState");
  const grid = el("galleryList") || el("galleryGrid") || el("galleryTableBody");
  if (ls) showNode(ls);
  if (es) hideNode(es);
  if (err) hideNode(err);
  if (grid && grid.tagName === "TBODY") grid.innerHTML = `<tr><td colspan="7" style="padding:32px;text-align:center;">Loading gallery...</td></tr>`;
}

function showEmptyState() {
  const ls = el("loadingState");
  const es = el("emptyState");
  const err = el("errorState");
  const tbody = el("galleryTableBody") || el("galleryList") || el("galleryGrid");
  if (ls) hideNode(ls);
  if (err) hideNode(err);
  if (es) showNode(es);
  if (tbody && tbody.tagName === "TBODY") tbody.innerHTML = `<tr><td colspan="7" style="padding:48px 16px;text-align:center;">No gallery items found.<br><span style="opacity:.6;font-size:13px;">Add project images to showcase your work.</span></td></tr>`;
}

function showErrorState(msg) {
  const ls = el("loadingState");
  const err = el("errorState");
  if (ls) hideNode(ls);
  if (err) { showNode(err); const p = err.querySelector("p"); if (p) p.textContent = msg; }
  showToast(msg, 3000);
}

/* ==================================================
   FILTER / SEARCH / SORT
================================================== */
function applyFilters() {
  let list = [...state.items];

  if (state.statusFilter!== "all") {
    const active = state.statusFilter === "active";
    list = list.filter(i => (i.active!== false) === active);
  }

  if (state.featuredFilter!== "all") {
    const feat = state.featuredFilter === "featured";
    list = list.filter(i =>!!i.featured === feat);
  }

  if (state.categoryFilter!== "all") {
    list = list.filter(i => (i.category || i.projectType || "General").toLowerCase() === state.categoryFilter.toLowerCase());
  }

  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(i => [i.title || "", i.description || "", i.category || "", i.projectType || "", i.location || ""].join(" ").toLowerCase().includes(q));
  }

  if (state.sortBy === "newest") list.sort((a, b) => getTime(b) - getTime(a));
  else if (state.sortBy === "oldest") list.sort((a, b) => getTime(a) - getTime(b));
  else if (state.sortBy === "name-asc") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  else if (state.sortBy === "name-desc") list.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
  else if (state.sortBy === "order") list.sort((a, b) => (a.order?? 999) - (b.order?? 999));

  state.filtered = list;
}

function updateStatistics() {
  const all = state.items;
  const active = all.filter(i => i.active!== false).length;
  const inactive = all.length - active;
  const featured = all.filter(i =>!!i.featured).length;
  setText("totalGallery", all.length);
  setText("totalProjects", all.length);
  setText("activeGallery", active);
  setText("activeProjects", active);
  setText("inactiveGallery", inactive);
  setText("featuredGallery", featured);
  setText("featuredProjects", featured);
}

/* ==================================================
   RENDER
================================================== */
function renderGallery() {
  const grid = el("galleryList") || el("galleryGrid");
  const tbody = el("galleryTableBody");
  const loading = el("loadingState");
  const empty = el("emptyState");
  const err = el("errorState");

  if (loading) hideNode(loading);
  if (err) hideNode(err);

  if (!state.filtered.length) {
    if (!state.items.length) showEmptyState();
    else {
      if (grid) grid.innerHTML = `<div style="padding:24px;text-align:center;opacity:.7;">No gallery items match search / filter.</div>`;
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:32px;text-align:center;">No matching gallery items.</td></tr>`;
      if (empty) hideNode(empty);
    }
    updateStatistics();
    return;
  }

  if (empty) hideNode(empty);

  if (grid) {
    grid.innerHTML = "";
    state.filtered.forEach(item => {
      const card = document.createElement("div");
      card.className = "admin-gallery-card";
      card.dataset.id = item.id;
      const img = item.image || item.imageUrl || item.url || "";
      const title = item.title || item.name || "Untitled";
      const cat = item.category || item.projectType || "General";
      const loc = item.location || "";
      card.innerHTML = `
        <div class="admin-gallery-thumb">
          ${img? `<img src="${escapeHTML(img)}" alt="${escapeHTML(title)}" loading="lazy" />` : `<div class="admin-gallery-placeholder">🖼️</div>`}
          <div class="admin-gallery-badges">
            <span class="admin-badge ${item.active!== false? 'admin-badge-success' : 'admin-badge-muted'}">${item.active!== false? 'Active' : 'Inactive'}</span>
            ${item.featured? '<span class="admin-badge admin-badge-featured">Featured</span>' : ''}
          </div>
        </div>
        <div class="admin-gallery-body">
          <h3 class="admin-gallery-title">${escapeHTML(title)}</h3>
          <p class="admin-gallery-meta">${escapeHTML(cat)}${loc? ' • ' + escapeHTML(loc) : ''} • Order ${item.order?? 0}</p>
          <p class="admin-gallery-desc">${escapeHTML((item.description || "").slice(0, 100))}</p>
          <div class="admin-gallery-actions">
            <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="edit" data-id="${item.id}">Edit</button>
            <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="toggle" data-id="${item.id}">${item.active!== false? 'Deactivate' : 'Activate'}</button>
            <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="featured" data-id="${item.id}">${item.featured? 'Unfeature' : 'Feature'}</button>
            <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  if (tbody) {
    tbody.innerHTML = "";
    state.filtered.forEach(item => {
      const tr = document.createElement("tr");
      tr.dataset.id = item.id;
      const img = item.image || item.imageUrl || item.url || "";
      const title = item.title || item.name || "-";
      const cat = item.category || item.projectType || "General";
      tr.innerHTML = `
        <td class="cell-img">${img? `<img src="${escapeHTML(img)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:6px;" />` : '—'}</td>
        <td>${escapeHTML(title)}</td>
        <td>${escapeHTML(cat)}</td>
        <td>${escapeHTML(item.location || "-")}</td>
        <td><span class="admin-badge ${item.active!== false? 'admin-badge-success' : 'admin-badge-muted'}">${item.active!== false? 'Active' : 'Inactive'}</span></td>
        <td>${item.featured? 'Yes' : 'No'}</td>
        <td class="cell-actions">
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="edit" data-id="${item.id}">Edit</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="delete" data-id="${item.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  updateStatistics();
}

/* ==================================================
   FORM HANDLING
================================================== */
function getFormData() {
  const title = sanitize(el("galleryTitle")?.value || el("projectTitle")?.value || "", 100);
  const description = sanitize(el("galleryDescription")?.value || el("projectDescription")?.value || "", 1000);
  const category = sanitize(el("galleryCategory")?.value || el("projectCategory")?.value || "Residential", 40);
  const location = sanitize(el("galleryLocation")?.value || el("projectLocation")?.value || "", 100);
  const projectType = sanitize(el("galleryProjectType")?.value || el("projectType")?.value || category, 40);
  const orderRaw = el("galleryOrder")?.value || el("projectOrder")?.value;
  const order = orderRaw!== "" && orderRaw!== undefined? parseInt(orderRaw, 10) : state.items.length;
  const active = el("galleryActive")? el("galleryActive").checked : el("projectActive")? el("projectActive").checked : true;
  const featured = el("galleryFeatured")? el("galleryFeatured").checked : el("projectFeatured")? el("projectFeatured").checked : false;
  const image = el("galleryImageUrl")?.value?.trim() || el("projectImageUrl")?.value?.trim() || el("galleryImage")?.dataset?.url || el("projectImage")?.dataset?.url || "";

  return { title, description, category, location, projectType, order: Number.isFinite(order)? order : 0, active, featured, image };
}

function validateForm(data, isEdit = false) {
  const errs = [];
  if (!data.title || data.title.length < 2) errs.push("Title required (min 2).");
  if (!isEdit &&!data.image) errs.push("Image required.");
  if (data.order < 0 || data.order > 1000) errs.push("Order must be 0-1000.");
  return errs;
}

function resetForm() {
  const form = el("galleryForm") || el("projectForm");
  if (form) form.reset();
  state.editingId = null;
  const preview = el("galleryImagePreview") || el("projectImagePreview") || el("imagePreview");
  if (preview) { preview.src = ""; preview.style.display = "none"; }
  const urlInputs = [el("galleryImageUrl"), el("projectImageUrl"), el("galleryImage"), el("projectImage")];
  urlInputs.forEach(inp => { if (inp?.dataset) { delete inp.dataset.url; delete inp.dataset.path; } });
  const modal = el("galleryModal") || el("projectModal") || el("galleryFormModal") || el("addGalleryModal");
  if (modal) { modal.style.display = "none"; modal.classList.remove("open"); document.body.style.overflow = ""; }
}

function openAddGallery() {
  resetForm();
  state.editingId = null;
  const modal = el("galleryModal") || el("projectModal") || el("galleryFormModal") || el("addGalleryModal");
  if (modal) { modal.style.display = "grid"; modal.classList.add("open"); document.body.style.overflow = "hidden"; }
}

function openEditGallery(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  state.editingId = id;
  const titleEl = el("galleryTitle") || el("projectTitle");
  const descEl = el("galleryDescription") || el("projectDescription");
  const catEl = el("galleryCategory") || el("projectCategory");
  const locEl = el("galleryLocation") || el("projectLocation");
  const typeEl = el("galleryProjectType") || el("projectType");
  const orderEl = el("galleryOrder") || el("projectOrder");
  const activeEl = el("galleryActive") || el("projectActive");
  const featuredEl = el("galleryFeatured") || el("projectFeatured");
  const urlEl = el("galleryImageUrl") || el("projectImageUrl");

  if (titleEl) titleEl.value = item.title || item.name || "";
  if (descEl) descEl.value = item.description || "";
  if (catEl) catEl.value = item.category || item.projectType || "Residential";
  if (locEl) locEl.value = item.location || "";
  if (typeEl) typeEl.value = item.projectType || item.category || "";
  if (orderEl) orderEl.value = item.order?? 0;
  if (activeEl) activeEl.checked = item.active!== false;
  if (featuredEl) featuredEl.checked =!!item.featured;
  if (urlEl) urlEl.value = item.image || item.imageUrl || item.url || "";

  const preview = el("galleryImagePreview") || el("projectImagePreview") || el("imagePreview");
  const img = item.image || item.imageUrl || item.url;
  if (preview && img) { preview.src = img; preview.style.display = "block"; }

  const modal = el("galleryModal") || el("projectModal") || el("galleryFormModal") || el("addGalleryModal");
  if (modal) { modal.style.display = "grid"; modal.classList.add("open"); document.body.style.overflow = "hidden"; }
}

async function saveGalleryItem() {
  const isEdit =!!state.editingId;
  const data = getFormData();
  const errs = validateForm(data, isEdit);
  if (errs.length) { showToast(errs[0], 3000); return; }

  const saveBtn = el("saveGalleryBtn") || el("saveProjectBtn") || el("gallerySaveBtn") || document.querySelector("[data-action='save-gallery']");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.setAttribute("aria-busy", "true"); }

  try {
    const payload = {
      title: data.title,
      name: data.title,
      description: data.description,
      category: data.category,
      projectType: data.projectType,
      location: data.location,
      image: data.image,
      imageUrl: data.image,
      url: data.image,
      active: data.active,
      featured: data.featured,
      order: data.order,
      updatedAt: serverTimestamp(),
    };

    if (!state.editingId) {
      payload.createdAt = serverTimestamp();
      const colRef = collection(db, GALLERY_COLLECTION);
      const docRef = await addDoc(colRef, payload);
      state.items.unshift({ id: docRef.id,...payload, createdAt: new Date() });
      showToast("Gallery item added successfully.", 2500);
    } else {
      const id = state.editingId;
      // Determine collection from original item
      const orig = state.items.find(x => x.id === id);
      const colName = orig?._fallback? FALLBACK_COLLECTION : GALLERY_COLLECTION : GALLERY_COLLECTION;
      await updateDoc(doc(db, colName, id), payload);
      state.items = state.items.map(x => x.id === id? {...x,...payload, updatedAt: new Date() } : x);
      showToast("Gallery item updated successfully.", 2500);
    }

    resetForm();
    applyFilters();
    renderGallery();
  } catch (err) {
    console.warn("[gallery.js] saveGalleryItem failed:", err?.message || err);
    showToast("Unable to save gallery item.", 3000);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.removeAttribute("aria-busy"); }
  }
}

async function deleteGalleryItem(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  if (!window.confirm(`Are you sure you want to delete "${item.title || item.name || id}"?`)) return;
  try {
    const colName = item._fallback? FALLBACK_COLLECTION : GALLERY_COLLECTION;
    await deleteDoc(doc(db, colName, id));
    // Do not blindly delete storage file - only if we have path and safe
    state.items = state.items.filter(x => x.id!== id);
    applyFilters();
    renderGallery();
    showToast("Gallery item deleted successfully.", 2500);
  } catch (err) {
    console.warn("[gallery.js] deleteGalleryItem failed:", err?.message || err);
    showToast("Unable to delete gallery item.", 3000);
  }
}

async function toggleGalleryStatus(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  const newActive =!(item.active!== false);
  try {
    const colName = item._fallback? FALLBACK_COLLECTION : GALLERY_COLLECTION;
    await updateDoc(doc(db, colName, id), { active: newActive, updatedAt: serverTimestamp() });
    item.active = newActive;
    applyFilters();
    renderGallery();
    showToast(`Gallery item ${newActive? 'activated' : 'deactivated'}.`, 2000);
  } catch {
    showToast("Unable to update status.", 3000);
  }
}

async function toggleFeatured(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  const newFeatured =!item.featured;
  try {
    const colName = item._fallback? FALLBACK_COLLECTION : GALLERY_COLLECTION;
    await updateDoc(doc(db, colName, id), { featured: newFeatured, updatedAt: serverTimestamp() });
    item.featured = newFeatured;
    applyFilters();
    renderGallery();
    showToast(newFeatured? "Marked as featured." : "Removed from featured.", 2000);
  } catch {
    showToast("Unable to update featured.", 3000);
  }
}

/* ==================================================
   IMAGE HANDLING - uses storage.js
================================================== */
function previewImage(file) {
  if (!file) return;
  const preview = el("galleryImagePreview") || el("projectImagePreview") || el("imagePreview");
  if (!preview) return;
  try {
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.style.display = "block";
  } catch {}
}

async function handleImageSelection(file) {
  if (!file) return;
  const validation = validateImage(file);
  if (!validation.valid) { showToast(validation.error, 3000); return; }

  previewImage(file);
  state.uploading = true;
  const uploadBtn = el("uploadGalleryBtn") || el("uploadImageBtn") || el("galleryUploadBtn");
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = "Uploading..."; }

  try {
    const result = await uploadFileWithUniqueName(file, STORAGE_FOLDERS.projects);
    const preview = el("galleryImagePreview") || el("projectImagePreview") || el("imagePreview");
    if (preview) preview.src = result.url;
    const urlInput = el("galleryImageUrl") || el("projectImageUrl") || el("galleryImage") || el("projectImage");
    if (urlInput) {
      if (urlInput.tagName === "INPUT") urlInput.value = result.url;
      urlInput.dataset = urlInput.dataset || {};
      urlInput.dataset.url = result.url;
      urlInput.dataset.path = result.path;
    }
    showToast("Image uploaded successfully.", 2000);
  } catch (err) {
    console.warn("[gallery.js] upload failed:", err?.message || err);
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
  const search = el("gallerySearch") || el("projectSearch") || el("searchGallery");
  if (search &&!search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", debounce(() => { state.search = search.value || ""; applyFilters(); renderGallery(); }, 250));
  }

  const statusFilter = el("statusFilter") || el("galleryStatusFilter");
  if (statusFilter &&!statusFilter.dataset.bound) {
    statusFilter.dataset.bound = "1";
    statusFilter.addEventListener("change", e => { state.statusFilter = e.target.value || "all"; applyFilters(); renderGallery(); });
  }

  const categoryFilter = el("categoryFilter") || el("galleryCategoryFilter") || el("projectCategoryFilter");
  if (categoryFilter &&!categoryFilter.dataset.bound) {
    categoryFilter.dataset.bound = "1";
    categoryFilter.addEventListener("change", e => { state.categoryFilter = e.target.value || "all"; applyFilters(); renderGallery(); });
  }

  const featuredFilter = el("featuredFilter") || el("galleryFeaturedFilter");
  if (featuredFilter &&!featuredFilter.dataset.bound) {
    featuredFilter.dataset.bound = "1";
    featuredFilter.addEventListener("change", e => { state.featuredFilter = e.target.value || "all"; applyFilters(); renderGallery(); });
  }

  const sortBy = el("sortGallery") || el("sortBy") || el("gallerySort");
  if (sortBy &&!sortBy.dataset.bound) {
    sortBy.dataset.bound = "1";
    sortBy.addEventListener("change", e => { state.sortBy = e.target.value || "newest"; applyFilters(); renderGallery(); });
  }

  const refreshBtn = el("refreshGallery") || el("refreshProjects");
  if (refreshBtn &&!refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", async () => {
      if (state.loading) return;
      refreshBtn.disabled = true;
      refreshBtn.setAttribute("aria-busy", "true");
      await loadGallery();
      refreshBtn.disabled = false;
      refreshBtn.removeAttribute("aria-busy");
      showToast("Gallery refreshed", 2000);
    });
  }

  const addBtn = el("addGalleryBtn") || el("addProjectBtn") || document.querySelector("[data-action='add-gallery']") || document.querySelector("[data-action='add-project']");
  if (addBtn &&!addBtn.dataset.bound) {
    addBtn.dataset.bound = "1";
    addBtn.addEventListener("click", openAddGallery);
  }

  const saveBtn = el("saveGalleryBtn") || el("saveProjectBtn") || el("gallerySaveBtn");
  if (saveBtn &&!saveBtn.dataset.bound) {
    saveBtn.dataset.bound = "1";
    saveBtn.addEventListener("click", e => { e.preventDefault(); saveGalleryItem(); });
  }

  const form = el("galleryForm") || el("projectForm");
  if (form &&!form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", e => { e.preventDefault(); saveGalleryItem(); });
  }

  const cancelBtn = el("cancelGalleryBtn") || el("cancelProjectBtn") || el("closeGalleryModal") || el("closeProjectModal");
  if (cancelBtn &&!cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = "1";
    cancelBtn.addEventListener("click", resetForm);
  }

  const modal = el("galleryModal") || el("projectModal") || el("galleryFormModal") || el("addGalleryModal");
  if (modal &&!modal.dataset.bound) {
    modal.dataset.bound = "1";
    modal.addEventListener("click", e => { if (e.target === modal) resetForm(); });
  }

  const fileInput = el("galleryImageFile") || el("projectImageFile") || el("galleryImageInput") || el("imageFile");
  if (fileInput &&!fileInput.dataset.bound) {
    fileInput.dataset.bound = "1";
    fileInput.addEventListener("change", e => { const f = e.target.files?.[0]; if (f) handleImageSelection(f); });
  }

  const uploadTrigger = el("uploadGalleryBtn") || el("uploadImageBtn") || el("galleryUploadBtn") || el("projectUploadBtn");
  if (uploadTrigger &&!uploadTrigger.dataset.bound) {
    uploadTrigger.dataset.bound = "1";
    uploadTrigger.addEventListener("click", () => { (el("galleryImageFile") || el("projectImageFile") || el("galleryImageInput"))?.click(); });
  }

  const gridRoot = el("galleryList") || el("galleryGrid") || el("galleryTableBody") || el("galleryTable");
  if (gridRoot &&!gridRoot.dataset.bound) {
    gridRoot.dataset.bound = "1";
    gridRoot.addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;
      if (action === "edit") openEditGallery(id);
      else if (action === "delete") deleteGalleryItem(id);
      else if (action === "toggle") toggleGalleryStatus(id);
      else if (action === "featured") toggleFeatured(id);
    });
  }

  document.addEventListener("keydown", e => { if (e.key === "Escape") resetForm(); });
}

/* ==================================================
   INIT
================================================== */
async function init() {
  const ok = await checkAuth();
  if (!ok) return;
  setupEventListeners();
  await loadGallery();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { loadGallery, renderGallery, openAddGallery, openEditGallery };
