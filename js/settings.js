"use strict";

/**
 * VEXO HVAC - js/settings.js
 * Business Settings Service - Firestore settings/company
 * Single document for public business info + website config
 * No Auth, no Storage, no Leads logic, no UI here
 * Security via Firestore Rules + Auth
 */

import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ==================================================
   CONSTANTS
================================================== */
const SETTINGS_COLLECTION = "settings";
const COMPANY_DOC_ID = "company";

const ALLOWED_FIELDS = [
  // Company
  "name",
  "phone",
  "email",
  "website",
  "address",
  // Business
  "businessHours",
  "serviceAreas",
  "emergencyService",
  "availableServices",
  // Brand
  "logoUrl",
  "companyDescription",
  // Contact / Social
  "whatsapp",
  "facebook",
  "instagram",
  // Website flags
  "maintenanceMode",
  "estimateEnabled",
];

const PUBLIC_FIELDS = [
  "name",
  "phone",
  "email",
  "website",
  "address",
  "businessHours",
  "serviceAreas",
  "emergencyService",
  "availableServices",
  "logoUrl",
  "companyDescription",
  "whatsapp",
  "facebook",
  "instagram",
  "maintenanceMode",
  "estimateEnabled",
];

const DEFAULT_SETTINGS = {
  name: "Vexo HVAC",
  phone: "(555) 123-4567",
  email: "info@vexohvac.com",
  website: "https://www.vexohvac.com",
  address: "123 HVAC Way, Dallas, TX 75201",
  businessHours: {
    weekdays: "7:00 AM - 7:00 PM",
    saturday: "8:00 AM - 5:00 PM",
    sunday: "Closed - Emergency Only",
    emergency: "24/7 Emergency Service Available",
  },
  serviceAreas: [
    { name: "Dallas", slug: "dallas" },
    { name: "Plano", slug: "plano" },
    { name: "Frisco", slug: "frisco" },
    { name: "Irving", slug: "irving" },
  ],
  emergencyService: {
    enabled: true,
    available: "24/7",
    phone: "(555) 123-4567",
    responseTime: "Same-day",
  },
  availableServices: [
    { id: "ac-repair", name: "AC Repair", slug: "ac-repair", active: true },
    { id: "ac-installation", name: "AC Installation", slug: "ac-installation", active: true },
    { id: "heating", name: "Heating & Furnace", slug: "heating", active: true },
    { id: "maintenance", name: "HVAC Maintenance", slug: "maintenance", active: true },
    { id: "air-quality", name: "Indoor Air Quality", slug: "indoor-air-quality", active: true },
    { id: "emergency", name: "Emergency HVAC", slug: "emergency", active: true, emergency: true },
  ],
  logoUrl: "",
  companyDescription: "Professional HVAC services in Dallas-Fort Worth. Licensed, insured, and trusted since 2010.",
  whatsapp: "",
  facebook: "",
  instagram: "",
  maintenanceMode: false,
  estimateEnabled: true,
};

/* ==================================================
   VALIDATION HELPERS
================================================== */

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function validatePhone(phone) {
  if (!isNonEmptyString(phone)) return "Phone is required.";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "Invalid phone (10-15 digits).";
  return null;
}

function validateEmail(email) {
  if (!isNonEmptyString(email)) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Invalid email format.";
  return null;
}

function validateWebsite(website) {
  if (!isNonEmptyString(website)) return null; // optional
  try {
    const url = new URL(website);
    if (!["http:", "https:"].includes(url.protocol)) return "Website must be http or https.";
    return null;
  } catch {
    return "Invalid website URL.";
  }
}

function validateBusinessHours(hours) {
  if (!hours || typeof hours!== "object" || Array.isArray(hours)) return "Business hours must be an object.";
  const requiredKeys = ["weekdays", "saturday", "sunday"];
  for (const k of requiredKeys) {
    if (hours[k]!== undefined && typeof hours[k]!== "string") return `BusinessHours.${k} must be string.`;
  }
  return null;
}

function validateServiceAreas(areas) {
  if (!Array.isArray(areas)) return "Service areas must be an array.";
  if (areas.length > 50) return "Too many service areas (max 50).";
  for (const a of areas) {
    if (!a || typeof a!== "object") return "Each service area must be an object.";
    if (!isNonEmptyString(a.name)) return "Each service area requires a name.";
    if (a.slug && typeof a.slug!== "string") return "Service area slug must be string.";
  }
  return null;
}

function validateServices(services) {
  if (!Array.isArray(services)) return "Services must be an array.";
  if (services.length > 30) return "Too many services (max 30).";
  for (const s of services) {
    if (!s || typeof s!== "object") return "Each service must be an object.";
    if (!isNonEmptyString(s.name)) return "Each service requires a name.";
    if (s.id && typeof s.id!== "string") return "Service id must be string.";
    if (s.slug && typeof s.slug!== "string") return "Service slug must be string.";
  }
  return null;
}

function validateBooleanField(value) {
  if (typeof value!== "boolean") return "Value must be boolean.";
  return null;
}

function sanitizeString(str, max = 500) {
  if (typeof str!== "string") return "";
  let v = str.replace(/\s+/g, " ").trim();
  if (v.length > max) v = v.slice(0, max).trim();
  return v;
}

function sanitizeDoc(data = {}) {
  const out = {};
  if (data.name!== undefined) out.name = sanitizeString(data.name, 80);
  if (data.phone!== undefined) out.phone = data.phone.toString().trim().slice(0, 30);
  if (data.email!== undefined) out.email = data.email.toString().trim().toLowerCase().slice(0, 120);
  if (data.website!== undefined) out.website = data.website.toString().trim().slice(0, 200);
  if (data.address!== undefined) out.address = sanitizeString(data.address, 200);
  if (data.logoUrl!== undefined) out.logoUrl = data.logoUrl.toString().trim().slice(0, 500);
  if (data.companyDescription!== undefined) out.companyDescription = sanitizeString(data.companyDescription, 1000);
  if (data.whatsapp!== undefined) out.whatsapp = data.whatsapp.toString().trim().slice(0, 30);
  if (data.facebook!== undefined) out.facebook = data.facebook.toString().trim().slice(0, 500);
  if (data.instagram!== undefined) out.instagram = data.instagram.toString().trim().slice(0, 500);
  return out;
}

/* ==================================================
   INTERNAL: doc ref
================================================== */
function getCompanyRef() {
  return doc(db, SETTINGS_COLLECTION, COMPANY_DOC_ID);
}

/* ==================================================
   1. getCompanySettings()
================================================== */

/**
 * Get company settings - returns default if not exists
 * @returns {Promise<Object>}
 */
export async function getCompanySettings() {
  try {
    const ref = getCompanyRef();
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { id: COMPANY_DOC_ID,...DEFAULT_SETTINGS, exists: false };
    }
    const data = snap.data();
    return { id: snap.id,...DEFAULT_SETTINGS,...data };
  } catch (err) {
    console.warn("[settings.js] getCompanySettings failed:", err?.message || err);
    throw new Error(err?.message || "Failed to get company settings.");
  }
}

/* ==================================================
   2. updateCompanySettings(updates)
================================================== */

/**
 * Update only allowed fields
 * @param {Object} updates
 * @returns {Promise<{success:boolean}>}
 */
export async function updateCompanySettings(updates = {}) {
  try {
    if (!updates || typeof updates!== "object" || Array.isArray(updates)) {
      throw new Error("Updates must be an object.");
    }

    const allowedUpdates = {};
    const errors = {};

    for (const field of ALLOWED_FIELDS) {
      if (!(field in updates)) continue;
      const value = updates[field];

      // Per-field validation
      if (field === "phone") {
        const e = validatePhone(value);
        if (e) errors.phone = e;
        else allowedUpdates.phone = value.toString().trim();
      } else if (field === "email") {
        const e = validateEmail(value);
        if (e) errors.email = e;
        else allowedUpdates.email = value.toString().trim().toLowerCase();
      } else if (field === "website" || field === "facebook" || field === "instagram" || field === "logoUrl") {
        if (field === "website") {
          const e = validateWebsite(value);
          if (e) errors.website = e;
          else allowedUpdates[field] = value.toString().trim();
        } else {
          // optional URLs - allow empty
          if (value) allowedUpdates[field] = value.toString().trim().slice(0, 500);
          else allowedUpdates[field] = "";
        }
      } else if (field === "businessHours") {
        const e = validateBusinessHours(value);
        if (e) errors.businessHours = e;
        else allowedUpdates.businessHours = value;
      } else if (field === "serviceAreas") {
        const e = validateServiceAreas(value);
        if (e) errors.serviceAreas = e;
        else allowedUpdates.serviceAreas = value;
      } else if (field === "availableServices") {
        const e = validateServices(value);
        if (e) errors.availableServices = e;
        else allowedUpdates.availableServices = value;
      } else if (field === "maintenanceMode" || field === "estimateEnabled") {
        const e = validateBooleanField(value);
        if (e) errors[field] = e;
        else allowedUpdates[field] = value;
      } else if (field === "emergencyService") {
        if (typeof value!== "object" || Array.isArray(value)) {
          errors.emergencyService = "Emergency service must be object.";
        } else {
          allowedUpdates.emergencyService = value;
        }
      } else {
        // Generic string fields
        if (typeof value === "string") {
          allowedUpdates[field] = sanitizeString(value, field === "companyDescription"? 1000 : 200);
        } else if (value === "") {
          allowedUpdates[field] = "";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new Error(`Validation failed: ${Object.values(errors).join(", ")}`);
    }

    if (Object.keys(allowedUpdates).length === 0) {
      throw new Error("No valid fields to update.");
    }

    const ref = getCompanyRef();
    allowedUpdates.updatedAt = serverTimestamp();

    // Use setDoc with merge to create if not exists
    await setDoc(ref, allowedUpdates, { merge: true });

    return { success: true };
  } catch (err) {
    console.warn("[settings.js] updateCompanySettings failed:", err?.message || err);
    throw new Error(err?.message || "Failed to update company settings.");
  }
}

/* ==================================================
   3. setCompanySetting(field, value)
================================================== */

/**
 * Update single allowed setting
 */
export async function setCompanySetting(field, value) {
  try {
    if (!ALLOWED_FIELDS.includes(field)) {
      throw new Error(`Field not allowed: ${field}. Allowed: ${ALLOWED_FIELDS.join(", ")}`);
    }
    const obj = { [field]: value };
    return await updateCompanySettings(obj);
  } catch (err) {
    console.warn("[settings.js] setCompanySetting failed:", field, err?.message || err);
    throw new Error(err?.message || "Failed to set company setting.");
  }
}

/* ==================================================
   4. getPublicSettings() - safe for public website
================================================== */

/**
 * Return only public-safe fields
 */
export async function getPublicSettings() {
  try {
    const full = await getCompanySettings();
    const pub = {};
    for (const f of PUBLIC_FIELDS) {
      if (f in full) pub[f] = full[f];
    }
    return pub;
  } catch (err) {
    console.warn("[settings.js] getPublicSettings failed:", err?.message || err);
    throw new Error(err?.message || "Failed to get public settings.");
  }
}

/* ==================================================
   5. updateBusinessHours(hours)
================================================== */

export async function updateBusinessHours(hours) {
  try {
    const e = validateBusinessHours(hours);
    if (e) throw new Error(e);
    const ref = getCompanyRef();
    await setDoc(ref, { businessHours: hours, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("[settings.js] updateBusinessHours failed:", err?.message || err);
    throw new Error(err?.message || "Failed to update business hours.");
  }
}

/* ==================================================
   6. updateServiceAreas(areas)
================================================== */

export async function updateServiceAreas(areas) {
  try {
    const e = validateServiceAreas(areas);
    if (e) throw new Error(e);
    const ref = getCompanyRef();
    await setDoc(ref, { serviceAreas: areas, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("[settings.js] updateServiceAreas failed:", err?.message || err);
    throw new Error(err?.message || "Failed to update service areas.");
  }
}

/* ==================================================
   7. updateAvailableServices(services)
================================================== */

export async function updateAvailableServices(services) {
  try {
    const e = validateServices(services);
    if (e) throw new Error(e);
    const ref = getCompanyRef();
    await setDoc(ref, { availableServices: services, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("[settings.js] updateAvailableServices failed:", err?.message || err);
    throw new Error(err?.message || "Failed to update available services.");
  }
}

/* ==================================================
   8. setMaintenanceMode(enabled)
================================================== */

export async function setMaintenanceMode(enabled) {
  try {
    if (typeof enabled!== "boolean") throw new Error("maintenanceMode must be boolean.");
    const ref = getCompanyRef();
    await setDoc(ref, { maintenanceMode: enabled, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true, maintenanceMode: enabled };
  } catch (err) {
    console.warn("[settings.js] setMaintenanceMode failed:", err?.message || err);
    throw new Error(err?.message || "Failed to set maintenance mode.");
  }
}

/* ==================================================
   9. setEstimateEnabled(enabled)
================================================== */

export async function setEstimateEnabled(enabled) {
  try {
    if (typeof enabled!== "boolean") throw new Error("estimateEnabled must be boolean.");
    const ref = getCompanyRef();
    await setDoc(ref, { estimateEnabled: enabled, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true, estimateEnabled: enabled };
  } catch (err) {
    console.warn("[settings.js] setEstimateEnabled failed:", err?.message || err);
    throw new Error(err?.message || "Failed to set estimate enabled.");
  }
}

/* ==================================================
   EXPORTS FOR CONVENIENCE
================================================== */
export const SETTINGS_DEFAULTS = DEFAULT_SETTINGS;
