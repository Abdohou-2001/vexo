"use strict";

/**
 * VEXO HVAC - js/config.js
 * Centralized PUBLIC configuration
 * No secrets, no Firebase keys, no auth logic, no Firestore logic
 * Safe for GitHub Pages and browser ES Modules
 */

export const CONFIG = {
  /* ==================================================
     1. APP - General application metadata
  ================================================== */
  APP: {
    name: "Vexo HVAC",
    shortName: "Vexo",
    version: "1.0.0",
    environment: "production", // development | staging | production
    defaultLanguage: "en-US",
    defaultCurrency: "USD",
    currencySymbol: "$",
    timezone: "America/Chicago",
  },

  /* ==================================================
     2. COMPANY - Public business info (placeholders)
  ================================================== */
  COMPANY: {
    name: "Vexo HVAC",
    legalName: "Vexo HVAC LLC",
    tagline: "Comfort You Can Count On.",
    phone: "(555) 123-4567",
    email: "info@vexohvac.com",
    supportEmail: "support@vexohvac.com",
    website: "https://www.vexohvac.com",
    address: {
      street: "123 HVAC Way",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      country: "USA",
      full: "123 HVAC Way, Dallas, TX 75201",
      googleMapsUrl: "", // PLACEHOLDER - add Google Maps link later
    },
    businessHours: {
      weekdays: "7:00 AM - 7:00 PM",
      saturday: "8:00 AM - 5:00 PM",
      sunday: "Closed - Emergency Only",
      emergency: "24/7 Emergency Service Available",
    },
    license: "TX LIC #HVAC-12345", // PLACEHOLDER
    insurance: "Licensed & Insured",
  },

  /* ==================================================
     3. BUSINESS - HVAC specific
  ================================================== */
  BUSINESS: {
    serviceAreas: [
      { name: "Dallas", slug: "dallas", primary: true, availability: "24/7" },
      { name: "Plano", slug: "plano", primary: false, availability: "24/7" },
      { name: "Frisco", slug: "frisco", primary: false, availability: "24/7" },
      { name: "Irving", slug: "irving", primary: false, availability: "Same-Day" },
      { name: "McKinney", slug: "mckinney", primary: false, availability: "Same-Day" },
      { name: "Richardson", slug: "richardson", primary: false, availability: "Same-Day" },
      { name: "Garland", slug: "garland", primary: false, availability: "Same-Day" },
      { name: "Carrollton", slug: "carrollton", primary: false, availability: "Same-Day" },
    ],

    services: [
      { id: "ac-repair", name: "AC Repair", slug: "ac-repair", popular: true, description: "Rapid diagnostics and lasting repairs" },
      { id: "ac-installation", name: "AC Installation", slug: "ac-installation", popular: true, description: "High-efficiency systems sized correctly" },
      { id: "heating", name: "Heating & Furnace", slug: "heating", popular: false, description: "Furnace repair, replacement and tune-ups" },
      { id: "maintenance", name: "HVAC Maintenance", slug: "maintenance", popular: false, description: "Seasonal maintenance plans" },
      { id: "air-quality", name: "Indoor Air Quality", slug: "indoor-air-quality", popular: false, description: "Purifiers, humidifiers and duct solutions" },
      { id: "emergency", name: "Emergency HVAC", slug: "emergency", popular: false, description: "24/7 emergency dispatch", emergency: true },
    ],

    emergency: {
      enabled: true,
      available: "24/7",
      phone: "(555) 123-4567",
      responseTime: "Same-day, ~2 hours average",
    },
  },

  /* ==================================================
     4. UI - Frontend preferences
  ================================================== */
  UI: {
    pagination: {
      defaultSize: 10,
      sizes: [5, 10, 25, 50],
    },
    toast: {
      duration: 2600,
      position: "bottom-right",
    },
    animation: {
      enabled: true,
      durationFast: 180,
      durationNormal: 250,
      durationSlow: 350,
      respectReducedMotion: true,
    },
    theme: {
      default: "light", // light | dark
      allowToggle: false,
    },
    table: {
      emptyText: "No records found.",
      loadingText: "Loading...",
    },
  },

  /* ==================================================
     5. CONTACT - Public contact channels
  ================================================== */
  CONTACT: {
    phone: "(555) 123-4567",
    phoneRaw: "+15551234567", // For tel: links - PLACEHOLDER
    email: "info@vexohvac.com",
    whatsapp: "", // PLACEHOLDER - e.g., "+15551234567"
    whatsappMessage: "Hello Vexo HVAC, I need help with my HVAC system.",
    form: {
      toEmail: "info@vexohvac.com",
      maxMessageLength: 1000,
    },
    social: {
      facebook: "", // PLACEHOLDER
      instagram: "", // PLACEHOLDER
      google: "", // PLACEHOLDER - Google Business Profile URL
      yelp: "", // PLACEHOLDER
    },
  },

  /* ==================================================
     6. ROUTES - Centralized paths (GitHub Pages safe)
  ================================================== */
  ROUTES: {
    public: {
      home: "/",
      index: "/index.html",
      services: "/#services",
      about: "/#about",
      reviews: "/#reviews",
      areas: "/#areas",
      estimate: "/#estimate",
      contact: "/#estimate",
    },
    admin: {
      login: "/admin/login.html",
      dashboard: "/admin/index.html",
      customers: "/admin/customers.html",
      leads: "/admin/index.html", // leads managed on dashboard
      quotes: "/admin/index.html",
      requests: "/admin/orders.html", // legacy name support
      orders: "/admin/orders.html",
      services: "/admin/products.html", // legacy name support
      products: "/admin/products.html",
      appointments: "/admin/orders.html",
      settings: "/admin/settings.html",
    },
    api: {
      // Future use - no backend yet
      base: "",
    },
  },

  /* ==================================================
     7. VALIDATION - Reusable limits (generic)
  ================================================== */
  VALIDATION: {
    nameMinLength: 2,
    nameMaxLength: 80,
    messageMaxLength: 1000,
    zipRegex: "^\\d{5}(-\\d{4})?$",
    phoneMinDigits: 10,
    phoneMaxDigits: 15,
  },

  /* ==================================================
     8. FEATURE FLAGS - easy to toggle later
  ================================================== */
  FEATURES: {
    enableEmergencyBanner: true,
    enableTrustBar: true,
    enableReviews: true,
    enableServiceAreas: true,
    enableWhatsApp: false,
    enableOnlineBooking: false,
  },
};

// Optional default export for convenience
export default CONFIG;
