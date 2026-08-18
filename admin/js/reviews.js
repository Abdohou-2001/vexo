"use strict";

/**
 * VEXO HVAC - admin/js/reviews.js
 * Reviews Admin Controller for admin/pages/reviews.html
 * Reuses /js/firebase.js, /js/auth.js, /js/storage.js, /js/utils.js
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
  reviews: [],
  filtered: [],
  loading: false,
  editingId: null,
  search: "",
  statusFilter: "all",
  ratingFilter: "all",
  featuredFilter: "all",
  sortBy: "newest",
  uploading: false,
};

const REVIEWS_COLLECTION = "reviews";

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

function clampRating(r) {
  const n = parseInt(r, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, n));
}

function starsHtml(rating) {
  const r = clampRating(rating);
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="admin-star ${i <= r? 'is-filled' : ''}" aria-hidden="true">${i <= r? '★' : '☆'}</span>`;
  }
  return html;
}

/* ==================================================
   LOAD REVIEWS
================================================== */
async function loadReviews() {
  if (state.loading) return;
  state.loading = true;
  showLoadingState();
  try {
    let list = [];
    try {
      const colRef = collection(db, REVIEWS_COLLECTION);
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      snap.forEach(d => list.push({ id: d.id,...d.data() }));
    } catch {
      // fallback without orderBy
      try {
        const colRef = collection(db, REVIEWS_COLLECTION);
        const snap = await getDocs(colRef);
        list = [];
        snap.forEach(d => list.push({ id: d.id,...d.data() }));
      } catch {}
    }

    // Fallback: try testimonials collection
    if (!list.length) {
      try {
        const colRef = collection(db, "testimonials");
        const snap = await getDocs(colRef);
        snap.forEach(d => list.push({ id: d.id,...d.data() }));
      } catch {}
    }

    state.reviews = list;
    applyFilters();
    renderReviews();
  } catch (err) {
    console.warn("[reviews.js] loadReviews failed:", err?.message || err);
    showErrorState("Unable to load reviews. Please try again.");
  } finally {
    state.loading = false;
  }
}

function showLoadingState() {
  const ls = el("loadingState");
  const es = el("emptyState");
  const err = el("errorState");
  const list = el("reviewsList") || el("reviewsTableBody");
  if (ls) showNode(ls);
  if (es) hideNode(es);
  if (err) hideNode(err);
  if (list && list.tagName === "TBODY") list.innerHTML = `<tr><td colspan="8" style="padding:32px;text-align:center;">Loading reviews...</td></tr>`;
}

function showEmptyState() {
  const ls = el("loadingState");
  const es = el("emptyState");
  const err = el("errorState");
  const tbody = el("reviewsTableBody") || el("reviewsList");
  if (ls) hideNode(ls);
  if (err) hideNode(err);
  if (es) showNode(es);
  if (tbody && tbody.tagName === "TBODY") tbody.innerHTML = `<tr><td colspan="8" style="padding:48px 16px;text-align:center;">No reviews found.<br><span style="opacity:.6;font-size:13px;">Add customer testimonials to build trust.</span></td></tr>`;
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
  let list = [...state.reviews];

  if (state.statusFilter!== "all") {
    const active = state.statusFilter === "active";
    list = list.filter(r => (r.active!== false) === active);
  }

  if (state.featuredFilter!== "all") {
    const feat = state.featuredFilter === "featured";
    list = list.filter(r =>!!r.featured === feat);
  }

  if (state.ratingFilter!== "all") {
    const rating = parseInt(state.ratingFilter, 10);
    if (Number.isFinite(rating)) list = list.filter(r => clampRating(r.rating || r.stars || 5) === rating);
  }

  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(r => [r.name || "", r.role || "", r.location || "", r.review || "", r.text || "", r.comment || ""].join(" ").toLowerCase().includes(q));
  }

  if (state.sortBy === "newest") list.sort((a, b) => getTime(b) - getTime(a));
  else if (state.sortBy === "oldest") list.sort((a, b) => getTime(a) - getTime(b));
  else if (state.sortBy === "rating-high") list.sort((a, b) => clampRating(b.rating || 5) - clampRating(a.rating || 5));
  else if (state.sortBy === "rating-low") list.sort((a, b) => clampRating(a.rating || 5) - clampRating(b.rating || 5));
  else if (state.sortBy === "name-asc") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else if (state.sortBy === "name-desc") list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  else if (state.sortBy === "order") list.sort((a, b) => (a.order?? 999) - (b.order?? 999));

  state.filtered = list;
}

function updateStatistics() {
  const all = state.reviews;
  const active = all.filter(r => r.active!== false).length;
  const inactive = all.length - active;
  const featured = all.filter(r =>!!r.featured).length;
  let totalRating = 0;
  let ratedCount = 0;
  all.forEach(r => {
    const rating = r.rating?? r.stars;
    if (rating!== undefined && rating!== null) {
      const c = clampRating(rating);
      totalRating += c;
      ratedCount++;
    }
  });
  const avg = ratedCount? (totalRating / ratedCount).toFixed(1) : "0.0";

  setText("totalReviews", all.length);
  setText("activeReviews", active);
  setText("inactiveReviews", inactive);
  setText("featuredReviews", featured);
  setText("averageRating", avg);
  const avgEl = el("averageRatingValue");
  if (avgEl) avgEl.textContent = avg;
}

/* ==================================================
   RENDER
================================================== */
function renderReviews() {
  const listEl = el("reviewsList");
  const tbody = el("reviewsTableBody");
  const loading = el("loadingState");
  const empty = el("emptyState");
  const err = el("errorState");

  if (loading) hideNode(loading);
  if (err) hideNode(err);

  if (!state.filtered.length) {
    if (!state.reviews.length) showEmptyState();
    else {
      if (listEl) listEl.innerHTML = `<div style="padding:24px;text-align:center;opacity:.7;">No reviews match search / filter.</div>`;
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:32px;text-align:center;">No matching reviews.</td></tr>`;
      if (empty) hideNode(empty);
    }
    updateStatistics();
    return;
  }

  if (empty) hideNode(empty);

  if (listEl &&!tbody) {
    listEl.innerHTML = "";
    state.filtered.forEach(r => {
      const card = document.createElement("div");
      card.className = "admin-review-card";
      card.dataset.id = r.id;
      const text = r.review || r.text || r.comment || "";
      const rating = clampRating(r.rating || r.stars || 5);
      const avatar = r.avatar || r.image || r.imageUrl || "";
      card.innerHTML = `
        <div class="admin-review-head">
          <div class="admin-review-avatar">${avatar? `<img src="${escapeHTML(avatar)}" alt="" />` : `<span>${escapeHTML((r.name || "C").charAt(0).toUpperCase())}</span>`}</div>
          <div class="admin-review-meta">
            <strong>${escapeHTML(r.name || "Anonymous")}</strong>
            <span>${escapeHTML(r.role || r.location || "")}</span>
            <span class="admin-review-stars">${starsHtml(rating)}</span>
          </div>
          <span class="admin-badge ${r.active!== false? 'admin-badge-success' : 'admin-badge-muted'}">${r.active!== false? 'Active' : 'Inactive'}</span>
        </div>
        <p class="admin-review-text">"${escapeHTML(text.slice(0, 220))}${text.length > 220? '…' : ''}"</p>
        <div class="admin-review-actions">
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="edit" data-id="${r.id}">Edit</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="toggle" data-id="${r.id}">${r.active!== false? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="featured" data-id="${r.id}">${r.featured? 'Unfeature' : 'Feature'}</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="delete" data-id="${r.id}">Delete</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  if (tbody) {
    tbody.innerHTML = "";
    state.filtered.forEach(r => {
      const tr = document.createElement("tr");
      tr.dataset.id = r.id;
      const text = (r.review || r.text || r.comment || "").toString();
      const rating = clampRating(r.rating || r.stars || 5);
      const name = r.name || "Anonymous";
      const loc = r.location || r.role || "-";
      tr.innerHTML = `
        <td>${escapeHTML(name)}</td>
        <td>${escapeHTML(loc)}</td>
        <td><span title="${rating}/5">${starsHtml(rating)}</span></td>
        <td style="max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHTML(text)}">${escapeHTML(text.slice(0, 80))}</td>
        <td><span class="admin-badge ${r.active!== false? 'admin-badge-success' : 'admin-badge-muted'}">${r.active!== false? 'Active' : 'Inactive'}</span></td>
        <td>${r.featured? 'Yes' : 'No'}</td>
        <td class="cell-actions">
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="edit" data-id="${r.id}">Edit</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="toggle" data-id="${r.id}">${r.active!== false? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="admin-btn-sm admin-btn-ghost" data-action="delete" data-id="${r.id}">Delete</button>
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
  const name = sanitize(el("reviewName")?.value || "", 80);
  const role = sanitize(el("reviewRole")?.value || "", 80);
  const location = sanitize(el("reviewLocation")?.value || "", 100);
  const ratingRaw = el("reviewRating")?.value;
  const rating = ratingRaw? clampRating(ratingRaw) : 5;
  const review = sanitize(el("reviewText")?.value || el("reviewComment")?.value || "", 1000);
  const orderRaw = el("reviewOrder")?.value;
  const order = orderRaw!== "" && orderRaw!== undefined? parseInt(orderRaw, 10) : state.reviews.length;
  const active = el("reviewActive")? el("reviewActive").checked : true;
  const featured = el("reviewFeatured")? el("reviewFeatured").checked : false;
  const image = el("reviewImageUrl")?.value?.trim() || el("reviewImage")?.dataset?.url || el("reviewAvatarUrl")?.value?.trim() || "";

  return { name, role, location, rating, review, order: Number.isFinite(order)? order : 0, active, featured, image };
}

function validateForm(data) {
  const errs = [];
  if (!data.name || data.name.length < 2) errs.push("Customer name required (min 2).");
  if (!data.review || data.review.length < 10) errs.push("Review text required (min 10).");
  if (data.rating < 1 || data.rating > 5) errs.push("Rating must be 1-5.");
  return errs;
}

function resetForm() {
  const form = el("reviewForm");
  if (form) form.reset();
  state.editingId = null;
  const preview = el("reviewImagePreview") || el("reviewAvatarPreview");
  if (preview) { preview.src = ""; preview.style.display = "none"; }
  const urlInput = el("reviewImageUrl") || el("reviewImage");
  if (urlInput?.dataset) { delete urlInput.dataset.url; }
  const modal = el("reviewModal") || el("reviewFormModal") || el("addReviewModal");
  if (modal) { modal.style.display = "none"; modal.classList.remove("open"); document.body.style.overflow = ""; }
  updateRatingDisplay(5);
}

function openAddReview() {
  resetForm();
  state.editingId = null;
  const modal = el("reviewModal") || el("reviewFormModal") || el("addReviewModal");
  if (modal) { modal.style.display = "grid"; modal.classList.add("open"); document.body.style.overflow = "hidden"; }
}

function openEditReview(id) {
  const r = state.reviews.find(x => x.id === id);
  if (!r) return;
  state.editingId = id;
  if (el("reviewName")) el("reviewName").value = r.name || "";
  if (el("reviewRole")) el("reviewRole").value = r.role || "";
  if (el("reviewLocation")) el("reviewLocation").value = r.location || "";
  if (el("reviewRating")) el("reviewRating").value = clampRating(r.rating || r.stars || 5);
  if (el("reviewText")) el("reviewText").value = r.review || r.text || r.comment || "";
  if (el("reviewComment")) el("reviewComment").value = r.review || r.text || r.comment || "";
  if (el("reviewOrder")) el("reviewOrder").value = r.order?? 0;
  if (el("reviewActive")) el("reviewActive").checked = r.active!== false;
  if (el("reviewFeatured")) el("reviewFeatured").checked =!!r.featured;
  if (el("reviewImageUrl")) el("reviewImageUrl").value = r.image || r.avatar || r.imageUrl || "";
  if (el("reviewAvatarUrl")) el("reviewAvatarUrl").value = r.avatar || r.image || "";
  const preview = el("reviewImagePreview") || el("reviewAvatarPreview");
  const img = r.image || r.avatar || r.imageUrl;
  if (preview && img) { preview.src = img; preview.style.display = "block"; }
  updateRatingDisplay(r.rating || r.stars || 5);
  const modal = el("reviewModal") || el("reviewFormModal") || el("addReviewModal");
  if (modal) { modal.style.display = "grid"; modal.classList.add("open"); document.body.style.overflow = "hidden"; }
}

function updateRatingDisplay(rating) {
  const r = clampRating(rating);
  const starsContainer = el("reviewStarsDisplay") || el("ratingStars");
  if (starsContainer) starsContainer.innerHTML = starsHtml(r);
  const input = el("reviewRating");
  if (input && input.value!= r) input.value = String(r);
}

async function saveReview() {
  const data = getFormData();
  const errs = validateForm(data);
  if (errs.length) { showToast(errs[0], 3000); return; }

  const saveBtn = el("saveReviewBtn") || el("reviewSaveBtn") || document.querySelector("[data-action='save-review']");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.setAttribute("aria-busy", "true"); }

  try {
    const payload = {
      name: data.name,
      role: data.role || null,
      location: data.location || null,
      rating: data.rating,
      stars: data.rating,
      review: data.review,
      text: data.review,
      comment: data.review,
      image: data.image || null,
      avatar: data.image || null,
      imageUrl: data.image || null,
      active: data.active,
      featured: data.featured,
      order: data.order,
      updatedAt: serverTimestamp(),
    };

    if (!state.editingId) {
      payload.createdAt = serverTimestamp();
      const colRef = collection(db, REVIEWS_COLLECTION);
      const docRef = await addDoc(colRef, payload);
      state.reviews.unshift({ id: docRef.id,...payload, createdAt: new Date(), rating: data.rating });
      showToast("Review added successfully.", 2500);
    } else {
      const id = state.editingId;
      await updateDoc(doc(db, REVIEWS_COLLECTION, id), payload);
      state.reviews = state.reviews.map(x => x.id === id? {...x,...payload, rating: data.rating, review: data.review, updatedAt: new Date() } : x);
      showToast("Review updated successfully.", 2500);
    }

    resetForm();
    applyFilters();
    renderReviews();
  } catch (err) {
    console.warn("[reviews.js] saveReview failed:", err?.message || err);
    showToast("Unable to save review.", 3000);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.removeAttribute("aria-busy"); }
  }
}

async function deleteReview(id) {
  const r = state.reviews.find(x => x.id === id);
  if (!r) return;
  if (!window.confirm(`Are you sure you want to delete review from "${r.name || id}"?`)) return;
  try {
    await deleteDoc(doc(db, REVIEWS_COLLECTION, id));
    state.reviews = state.reviews.filter(x => x.id!== id);
    applyFilters();
    renderReviews();
    showToast("Review deleted successfully.", 2500);
  } catch (err) {
    console.warn("[reviews.js] deleteReview failed:", err?.message || err);
    showToast("Unable to delete this review.", 3000);
  }
}

async function toggleReviewStatus(id) {
  const r = state.reviews.find(x => x.id === id);
  if (!r) return;
  const newActive =!(r.active!== false);
  try {
    await updateDoc(doc(db, REVIEWS_COLLECTION, id), { active: newActive, updatedAt: serverTimestamp() });
    r.active = newActive;
    applyFilters();
    renderReviews();
    showToast(`Review ${newActive? 'activated' : 'deactivated'}.`, 2000);
  } catch {
    showToast("Unable to update review status.", 3000);
  }
}

async function toggleFeatured(id) {
  const r = state.reviews.find(x => x.id === id);
  if (!r) return;
  const newFeatured =!r.featured;
  try {
    await updateDoc(doc(db, REVIEWS_COLLECTION, id), { featured: newFeatured, updatedAt: serverTimestamp() });
    r.featured = newFeatured;
    applyFilters();
    renderReviews();
    showToast(newFeatured? "Marked as featured." : "Removed from featured.", 2000);
  } catch {
    showToast("Unable to update featured status.", 3000);
  }
}

/* ==================================================
   IMAGE UPLOAD
================================================== */
async function handleImageUpload(file) {
  if (!file) return;
  const validation = validateImage(file);
  if (!validation.valid) { showToast(validation.error, 3000); return; }

  const preview = el("reviewImagePreview") || el("reviewAvatarPreview");
  if (preview) {
    try { preview.src = URL.createObjectURL(file); preview.style.display = "block"; } catch {}
  }

  state.uploading = true;
  try {
    const result = await uploadFileWithUniqueName(file, STORAGE_FOLDERS.company);
    if (preview) preview.src = result.url;
    const urlInput = el("reviewImageUrl") || el("reviewImage") || el("reviewAvatarUrl");
    if (urlInput) {
      if (urlInput.tagName === "INPUT") urlInput.value = result.url;
      urlInput.dataset = urlInput.dataset || {};
      urlInput.dataset.url = result.url;
    }
    showToast("Image uploaded.", 2000);
  } catch (err) {
    showToast("Image upload failed.", 3000);
  } finally {
    state.uploading = false;
  }
}

/* ==================================================
   EVENTS
================================================== */
function setupEventListeners() {
  const search = el("reviewSearch");
  if (search &&!search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", debounce(() => { state.search = search.value || ""; applyFilters(); renderReviews(); }, 250));
  }

  const statusFilter = el("statusFilter");
  if (statusFilter &&!statusFilter.dataset.bound) {
    statusFilter.dataset.bound = "1";
    statusFilter.addEventListener("change", e => { state.statusFilter = e.target.value || "all"; applyFilters(); renderReviews(); });
  }

  const featuredFilter = el("featuredFilter");
  if (featuredFilter &&!featuredFilter.dataset.bound) {
    featuredFilter.dataset.bound = "1";
    featuredFilter.addEventListener("change", e => { state.featuredFilter = e.target.value || "all"; applyFilters(); renderReviews(); });
  }

  const ratingFilter = el("ratingFilter");
  if (ratingFilter &&!ratingFilter.dataset.bound) {
    ratingFilter.dataset.bound = "1";
    ratingFilter.addEventListener("change", e => { state.ratingFilter = e.target.value || "all"; applyFilters(); renderReviews(); });
  }

  const sortBy = el("sortReviews") || el("sortBy");
  if (sortBy &&!sortBy.dataset.bound) {
    sortBy.dataset.bound = "1";
    sortBy.addEventListener("change", e => { state.sortBy = e.target.value || "newest"; applyFilters(); renderReviews(); });
  }

  const refreshBtn = el("refreshReviews");
  if (refreshBtn &&!refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", async () => {
      if (state.loading) return;
      refreshBtn.disabled = true;
      refreshBtn.setAttribute("aria-busy", "true");
      await loadReviews();
      refreshBtn.disabled = false;
      refreshBtn.removeAttribute("aria-busy");
      showToast("Reviews refreshed", 2000);
    });
  }

  const addBtn = el("addReviewBtn") || document.querySelector("[data-action='add-review']");
  if (addBtn &&!addBtn.dataset.bound) {
    addBtn.dataset.bound = "1";
    addBtn.addEventListener("click", openAddReview);
  }

  const saveBtn = el("saveReviewBtn") || el("reviewSaveBtn");
  if (saveBtn &&!saveBtn.dataset.bound) {
    saveBtn.dataset.bound = "1";
    saveBtn.addEventListener("click", e => { e.preventDefault(); saveReview(); });
  }

  const form = el("reviewForm");
  if (form &&!form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", e => { e.preventDefault(); saveReview(); });
  }

  const cancelBtn = el("cancelReviewBtn") || el("closeReviewModal");
  if (cancelBtn &&!cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = "1";
    cancelBtn.addEventListener("click", resetForm);
  }

  const modal = el("reviewModal") || el("reviewFormModal") || el("addReviewModal");
  if (modal &&!modal.dataset.bound) {
    modal.dataset.bound = "1";
    modal.addEventListener("click", e => { if (e.target === modal) resetForm(); });
  }

  const imageInput = el("reviewImageFile") || el("reviewAvatarFile") || el("reviewImageInput");
  if (imageInput &&!imageInput.dataset.bound) {
    imageInput.dataset.bound = "1";
    imageInput.addEventListener("change", e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); });
  }

  const ratingInput = el("reviewRating");
  if (ratingInput &&!ratingInput.dataset.bound) {
    ratingInput.dataset.bound = "1";
    ratingInput.addEventListener("input", e => updateRatingDisplay(e.target.value));
    ratingInput.addEventListener("change", e => updateRatingDisplay(e.target.value));
  }

  // Star click delegation
  const starsWrap = el("reviewStarsInput") || el("ratingStarsInput");
  if (starsWrap &&!starsWrap.dataset.bound) {
    starsWrap.dataset.bound = "1";
    starsWrap.addEventListener("click", e => {
      const star = e.target.closest("[data-rating]");
      if (!star) return;
      const r = parseInt(star.dataset.rating, 10);
      if (Number.isFinite(r)) { updateRatingDisplay(r); }
    });
  }

  const listRoot = el("reviewsList") || el("reviewsTableBody") || el("reviewsTable");
  if (listRoot &&!listRoot.dataset.bound) {
    listRoot.dataset.bound = "1";
    listRoot.addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;
      if (action === "edit") openEditReview(id);
      else if (action === "delete") deleteReview(id);
      else if (action === "toggle") toggleReviewStatus(id);
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
  await loadReviews();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { loadReviews, renderReviews };
