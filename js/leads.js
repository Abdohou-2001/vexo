"use strict";

/**
 * VEXO HVAC - js/leads.js
 * Lead Management Service - Firestore leads collection
 * Workflow: Form -> leads.js -> Firestore -> Admin Dashboard
 * Client-side - security enforced by Firestore Rules + Auth
 * No UI, no Auth logic, no admin UI here
 */

import { db } from "./firebase.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ==================================================
   CONSTANTS
================================================== */
const LEADS_COLLECTION = "leads";

export const LEAD_STATUSES = ["new", "contacted", "scheduled", "quoted", "won", "lost"];
export const LEAD_SOURCES = ["website", "phone", "referral", "google", "emergency"];
export const ALLOWED_UPDATE_FIELDS = [
  "name",
  "phone",
  "email",
  "service",
  "message",
  "address",
  "preferredDate",
  "preferredTime",
  "status",
  "source",
  "notes",
  "assignedTo",
];

const DEFAULT_STATUS = "new";
const DEFAULT_SOURCE = "website";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/* ==================================================
   VALIDATION & SANITIZATION
================================================== */

/**
 * Sanitize helpers - no HTML injection
 */
function sanitizeString(value, maxLen = 500) {
  if (typeof value!== "string") return "";
  let v = value.replace(/\s+/g, " ").trim();
  if (v.length > maxLen) v = v.slice(0, maxLen).trim();
  return v;
}

function sanitizePhone(phone) {
  if (typeof phone!== "string") return "";
  // Keep digits, +, -, (, ), space
  let v = phone.replace(/[^\d+()\-.\s]/g, "").trim();
  return v.slice(0, 30);
}

function sanitizeEmail(email) {
  if (typeof email!== "string") return "";
  return email.trim().toLowerCase().slice(0, 120);
}

function sanitizeService(service) {
  if (typeof service!== "string") return "";
  return service.replace(/\s+/g, " ").trim().slice(0, 100);
}

function normalizeLeadInput(data = {}) {
  return {
    name: sanitizeString(data.name, 80),
    phone: sanitizePhone(data.phone),
    email: data.email? sanitizeEmail(data.email) : "",
    service: sanitizeService(data.service),
    message: sanitizeString(data.message, 1000),
    address: sanitizeString(data.address, 200),
    preferredDate: sanitizeString(data.preferredDate, 20),
    preferredTime: sanitizeString(data.preferredTime, 20),
    notes: sanitizeString(data.notes, 1000),
  };
}

/**
 * Validate lead data
 * @param {Object} data
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validateLead(data = {}) {
  const errors = {};
  const normalized = normalizeLeadInput(data);

  if (!normalized.name || normalized.name.length < 2) {
    errors.name = "Name is required (min 2 characters).";
  }

  if (!normalized.phone) {
    errors.phone = "Phone number is required.";
  } else {
    const digits = normalized.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      errors.phone = "Invalid phone number (10-15 digits required).";
    }
  }

  if (!normalized.service) {
    errors.service = "Service is required.";
  }

  if (normalized.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized.email)) {
      errors.email = "Invalid email format.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: normalized,
  };
}

/* ==================================================
   1. CREATE LEAD - public website can call this
================================================== */

/**
 * Create new lead - public form entry point
 * @param {Object} data - { name, phone, email?, service, message?, address?, preferredDate?, preferredTime? }
 * @returns {Promise<{ id: string }>}
 */
export async function createLead(data = {}) {
  try {
    const validation = validateLead(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${Object.values(validation.errors).join(", ")}`);
    }

    const s = validation.sanitized;

    // Do not trust client status/source - enforce server defaults
    const leadDoc = {
      name: s.name,
      phone: s.phone,
      email: s.email || null,
      service: s.service,
      message: s.message || null,
      address: s.address || null,
      preferredDate: s.preferredDate || null,
      preferredTime: s.preferredTime || null,
      status: DEFAULT_STATUS,
      source: DEFAULT_SOURCE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Remove nulls for cleaner doc (optional)
    Object.keys(leadDoc).forEach((k) => {
      if (leadDoc[k] === null || leadDoc[k] === "") {
        if (["email", "message", "address", "preferredDate", "preferredTime"].includes(k)) {
          delete leadDoc[k];
        }
      }
    });

    const colRef = collection(db, LEADS_COLLECTION);
    const docRef = await addDoc(colRef, leadDoc);

    return { id: docRef.id };
  } catch (err) {
    console.warn("[leads.js] createLead failed:", err?.message || err);
    throw new Error(err?.message || "Failed to create lead.");
  }
}

/* ==================================================
   2. GET LEAD
================================================== */

/**
 * Get single lead by ID
 * @param {string} leadId
 * @returns {Promise<Object|null>}
 */
export async function getLead(leadId) {
  try {
    if (!leadId || typeof leadId!== "string") throw new Error("Invalid lead ID.");
    const docRef = doc(db, LEADS_COLLECTION, leadId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id,...snap.data() };
  } catch (err) {
    console.warn("[leads.js] getLead failed:", leadId, err?.message || err);
    throw new Error(err?.message || "Failed to get lead.");
  }
}

/* ==================================================
   3. GET LEADS - with status filter, limit, ordered by createdAt desc
================================================== */

/**
 * Get leads with options
 * @param {{ status?: string, limit?: number, source?: string }} options
 * @returns {Promise<Object[]>}
 */
export async function getLeads(options = {}) {
  try {
    const colRef = collection(db, LEADS_COLLECTION);
    const constraints = [];

    if (options.status && LEAD_STATUSES.includes(options.status)) {
      constraints.push(where("status", "==", options.status));
    }

    if (options.source && LEAD_SOURCES.includes(options.source)) {
      constraints.push(where("source", "==", options.source));
    }

    // Always order by createdAt desc for recent first
    constraints.push(orderBy("createdAt", "desc"));

    const lim = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    constraints.push(fsLimit(lim));

    const q = query(colRef,...constraints);
    const snap = await getDocs(q);

    const leads = [];
    snap.forEach((d) => {
      leads.push({ id: d.id,...d.data() });
    });

    return leads;
  } catch (err) {
    console.warn("[leads.js] getLeads failed:", err?.message || err);
    throw new Error(err?.message || "Failed to get leads.");
  }
}

/* ==================================================
   4. UPDATE LEAD STATUS
================================================== */

/**
 * Update only status field - validates status whitelist
 */
export async function updateLeadStatus(leadId, status) {
  try {
    if (!leadId || typeof leadId!== "string") throw new Error("Invalid lead ID.");
    if (!LEAD_STATUSES.includes(status)) {
      throw new Error(`Invalid status. Allowed: ${LEAD_STATUSES.join(", ")}`);
    }

    const docRef = doc(db, LEADS_COLLECTION, leadId);
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });

    return { success: true, id: leadId, status };
  } catch (err) {
    console.warn("[leads.js] updateLeadStatus failed:", err?.message || err);
    throw new Error(err?.message || "Failed to update lead status.");
  }
}

/* ==================================================
   5. UPDATE LEAD - generic update, only allowed fields
================================================== */

/**
 * Update lead with allowed fields only
 */
export async function updateLead(leadId, updates = {}) {
  try {
    if (!leadId || typeof leadId!== "string") throw new Error("Invalid lead ID.");
    if (!updates || typeof updates!== "object") throw new Error("Invalid updates object.");

    const sanitizedUpdates = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (key in updates) {
        let val = updates[key];
        if (typeof val === "string") {
          if (key === "phone") val = sanitizePhone(val);
          else if (key === "email") val = sanitizeEmail(val);
          else if (key === "service") val = sanitizeService(val);
          else val = sanitizeString(val, key === "message" || key === "notes"? 1000 : 200);
        }

        // Validate status if being updated
        if (key === "status" &&!LEAD_STATUSES.includes(val)) {
          throw new Error(`Invalid status: ${val}`);
        }

        // Validate email if being updated
        if (key === "email" && val) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(val)) throw new Error("Invalid email format.");
        }

        if (val!== "" || key === "email") {
          sanitizedUpdates[key] = val || null;
        }
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      throw new Error("No valid fields to update.");
    }

    // Never allow overwrite of createdAt or id
    delete sanitizedUpdates.createdAt;
    delete sanitizedUpdates.id;

    sanitizedUpdates.updatedAt = serverTimestamp();

    const docRef = doc(db, LEADS_COLLECTION, leadId);
    await updateDoc(docRef, sanitizedUpdates);

    return { success: true, id: leadId };
  } catch (err) {
    console.warn("[leads.js] updateLead failed:", err?.message || err);
    throw new Error(err?.message || "Failed to update lead.");
  }
}

/* ==================================================
   6. DELETE LEAD
================================================== */

export async function deleteLead(leadId) {
  try {
    if (!leadId || typeof leadId!== "string") throw new Error("Invalid lead ID.");
    const docRef = doc(db, LEADS_COLLECTION, leadId);
    await deleteDoc(docRef);
    return { success: true, id: leadId, message: "Lead deleted." };
  } catch (err) {
    console.warn("[leads.js] deleteLead failed:", leadId, err?.message || err);
    // Handle missing doc gracefully
    if (err?.code === "not-found") {
      return { success: true, id: leadId, message: "Lead already deleted or not found." };
    }
    throw new Error(err?.message || "Failed to delete lead.");
  }
}

/* ==================================================
   7. COUNT LEADS BY STATUS - efficient count
================================================== */

export async function countLeadsByStatus(status) {
  try {
    if (!LEAD_STATUSES.includes(status)) {
      throw new Error(`Invalid status. Allowed: ${LEAD_STATUSES.join(", ")}`);
    }

    const colRef = collection(db, LEADS_COLLECTION);
    const q = query(colRef, where("status", "==", status));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.warn("[leads.js] countLeadsByStatus failed:", status, err?.message || err);
    throw new Error(err?.message || "Failed to count leads.");
  }
}

/* ==================================================
   ADDITIONAL HELPERS
================================================== */

/**
 * Count all leads (no filter)
 */
export async function countAllLeads() {
  try {
    const colRef = collection(db, LEADS_COLLECTION);
    const snap = await getCountFromServer(colRef);
    return snap.data().count;
  } catch (err) {
    console.warn("[leads.js] countAllLeads failed:", err?.message || err);
    throw new Error(err?.message || "Failed to count leads.");
  }
}
