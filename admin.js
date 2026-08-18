"use strict";

/**
 * VEXO HVAC - js/admin.js
 * Admin Dashboard Controller - Frontend only, no Firebase yet
 * Works on: admin/index.html, products.html, orders.html, customers.html, settings.html
 * Safe for missing DOM - same file loaded on multiple pages
 * Entities: Leads, Quote Requests, Customers, Appointments, Services, Emergency Requests
 */

const VexoAdmin = (() => {
  /* ==================================================
     0. DEPENDENCIES & CONSTANTS
  ================================================== */
  const U = window.VexoUtils || null;

  const $ = (sel, parent = document) => {
    if (U && U.$) return U.$(sel, parent);
    try { return parent.querySelector(sel); } catch { return null; }
  };
  const $$ = (sel, parent = document) => {
    if (U && U.$$) return U.$$(sel, parent);
    try { return Array.from(parent.querySelectorAll(sel)); } catch { return []; }
  };

  const STORAGE_KEYS = {
    customers: "vexo_admin_customers",
    leads: "vexo_admin_leads",
    requests: "vexo_admin_requests",
    services: "vexo_admin_services",
    settings: "vexo_admin_settings",
  };

  const STATUSES = ["new", "contacted", "scheduled", "completed", "cancelled"];
  const HVAC_SERVICES = ["AC Installation", "AC Repair", "Heating", "Maintenance", "Emergency Service", "Indoor Air Quality"];

  /* ==================================================
     1. STATE - mock data layer, clear separation
  ================================================== */
  const state = {
    customers: [],
    leads: [],
    requests: [],
    services: [],
    settings: {},
    currentPage: "",
  };

  /* ==================================================
     2. STORAGE HELPERS - non-sensitive only
  ================================================== */
  const storage = {
    get(key, fallback) {
      if (U && U.getStorage) return U.getStorage(key, fallback);
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        try { return JSON.parse(raw); } catch { return raw; }
      } catch { return fallback; }
    },
    set(key, value) {
      if (U && U.setStorage) return U.setStorage(key, value);
      try {
        localStorage.setItem(key, typeof value === "string"? value : JSON.stringify(value));
        return true;
      } catch { return false; }
    },
  };

  /* ==================================================
     3. MOCK DATA GENERATORS - for dev only
  ================================================== */
  const mock = {
    id() {
      return "v_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    },
    customers() {
      return [
        { id: "c_1", name: "Sarah Mitchell", email: "sarah@email.com", phone: "(555) 123-4567", city: "Dallas", zip: "75201", createdAt: "2026-01-15", totalRequests: 2 },
        { id: "c_2", name: "James Thompson", email: "james.t@email.com", phone: "(555) 987-6543", city: "Plano", zip: "75023", createdAt: "2026-02-03", totalRequests: 1 },
        { id: "c_3", name: "Rachel Kim", email: "rachel.k@email.com", phone: "(555) 456-7890", city: "Frisco", zip: "75033", createdAt: "2026-03-10", totalRequests: 3 },
      ];
    },
    leads() {
      return [
        { id: "l_1", name: "John Smith", phone: "(555) 111-2222", email: "john.smith@email.com", service: "AC Repair", status: "new", zip: "75201", message: "AC not cooling", createdAt: new Date(Date.now() - 86400000 * 1).toISOString(), source: "Website Form" },
        { id: "l_2", name: "Amanda Lee", phone: "(555) 222-3333", email: "amanda@email.com", service: "AC Installation", status: "contacted", zip: "75023", message: "Need new system quote 2400 sq ft", createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), source: "Phone" },
        { id: "l_3", name: "David Brown", phone: "(555) 333-4444", email: "david.b@email.com", service: "Heating", status: "scheduled", zip: "75033", message: "Furnace making noise", createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), source: "Website Form" },
        { id: "l_4", name: "Lisa Garcia", phone: "(555) 444-5555", email: "lisa.g@email.com", service: "Emergency Service", status: "new", zip: "75204", message: "Emergency - no heat", createdAt: new Date().toISOString(), source: "Emergency Line" },
      ];
    },
    requests() {
      return [
        { id: "r_1", customerName: "Sarah Mitchell", service: "AC Repair", status: "completed", date: "2026-04-01", amount: 450, customerId: "c_1" },
        { id: "r_2", customerName: "James Thompson", service: "AC Installation", status: "scheduled", date: "2026-05-18", amount: 6200, customerId: "c_2" },
        { id: "r_3", customerName: "Rachel Kim", service: "Maintenance", status: "pending", date: "2026-05-20", amount: 149, customerId: "c_3" },
      ];
    },
    services() {
      return HVAC_SERVICES.map((name, i) => ({
        id: "s_" + (i + 1),
        name,
        active: true,
        description: name + " for residential homes in Dallas-Fort Worth",
        basePrice: i === 1? 89 : 149,
      }));
    },
  };

  /* ==================================================
     4. DATA LAYER - reusable, no business lock-in
  ================================================== */
  const data = {
    load() {
      state.customers = storage.get(STORAGE_KEYS.customers, mock.customers());
      state.leads = storage.get(STORAGE_KEYS.leads, mock.leads());
      state.requests = storage.get(STORAGE_KEYS.requests, mock.requests());
      state.services = storage.get(STORAGE_KEYS.services, mock.services());
      state.settings = storage.get(STORAGE_KEYS.settings, { companyName: "Vexo HVAC", city: "Dallas, TX", phone: "(555) 123-4567" });
    },
    saveCustomers() { storage.set(STORAGE_KEYS.customers, state.customers); },
    saveLeads() { storage.set(STORAGE_KEYS.leads, state.leads); },
    saveRequests() { storage.set(STORAGE_KEYS.requests, state.requests); },

    getCustomers() { return [...state.customers]; },
    getLeads() { return [...state.leads]; },
    getRequests() { return [...state.requests]; },
    getServices() { return [...state.services]; },

    addCustomer(customer) {
      if (!customer ||!customer.name) return null;
      const newCustomer = { id: mock.id(), createdAt: new Date().toISOString(), totalRequests: 0,...customer };
      state.customers.unshift(newCustomer);
      data.saveCustomers();
      return newCustomer;
    },
    updateCustomer(id, updates) {
      const idx = state.customers.findIndex(c => c.id === id);
      if (idx === -1) return null;
      state.customers[idx] = {...state.customers[idx],...updates };
      data.saveCustomers();
      return state.customers[idx];
    },
    deleteCustomer(id) {
      const before = state.customers.length;
      state.customers = state.customers.filter(c => c.id!== id);
      if (state.customers.length!== before) data.saveCustomers();
      return before!== state.customers.length;
    },

    addLead(lead) {
      const newLead = { id: mock.id(), status: "new", createdAt: new Date().toISOString(),...lead };
      state.leads.unshift(newLead);
      data.saveLeads();
      return newLead;
    },
    updateLeadStatus(id, status) {
      if (!STATUSES.includes(status)) return null;
      const lead = state.leads.find(l => l.id === id);
      if (!lead) return null;
      lead.status = status;
      data.saveLeads();
      return lead;
    },
    deleteLead(id) {
      state.leads = state.leads.filter(l => l.id!== id);
      data.saveLeads();
    },
  };

  /* ==================================================
     5. SEARCH / FILTER / SORT - generic, reusable
  ================================================== */
  const search = {
    normalize(str) {
      if (typeof str!== "string") return "";
      return str.toLowerCase().trim();
    },
    filterByQuery(items, query, fields) {
      if (!Array.isArray(items)) return [];
      const q = search.normalize(query);
      if (!q) return [...items];
      return items.filter(item => {
        return fields.some(field => {
          const val = item[field];
          if (val == null) return false;
          return search.normalize(String(val)).includes(q);
        });
      });
    },
  };

  const filter = {
    byStatus(items, status) {
      if (!Array.isArray(items)) return [];
      if (!status || status === "all") return [...items];
      const s = search.normalize(status);
      return items.filter(i => search.normalize(i.status) === s);
    },
    byService(items, service) {
      if (!Array.isArray(items)) return [];
      if (!service || service === "all") return [...items];
      const s = search.normalize(service);
      return items.filter(i => search.normalize(i.service) === s);
    },
    byDateRange(items, from, to, field = "createdAt") {
      if (!Array.isArray(items)) return [];
      const fromTime = from? new Date(from).getTime() : null;
      const toTime = to? new Date(to).getTime() : null;
      return items.filter(item => {
        const t = new Date(item[field] || item.date).getTime();
        if (Number.isNaN(t)) return true;
        if (fromTime && t < fromTime) return false;
        if (toTime && t > toTime) return false;
        return true;
      });
    },
  };

  const sort = {
    byField(items, field, dir = "desc") {
      if (!Array.isArray(items)) return [];
      const d = dir === "asc"? 1 : -1;
      return [...items].sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        // date aware
        const at = Date.parse(av);
        const bt = Date.parse(bv);
        if (!Number.isNaN(at) &&!Number.isNaN(bt)) return (at - bt) * d;
        // number aware
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * d;
        return String(av).localeCompare(String(bv)) * d;
      });
    },
  };

  /* ==================================================
     6. NOTIFICATIONS - uses existing elements if present
  ================================================== */
  const notify = {
    el: null,
    timeout: null,
    init() {
      this.el = $(".admin-toast,.toast-admin,.admin-notification, #adminToast,.notification");
    },
    show(message, type = "info") {
      if (U && U.$) {
        // Try to reuse global toast if admin toast not found
        const toast = this.el || $("#toast") || $(".toast");
        if (toast) {
          toast.textContent = message;
          toast.className = toast.className.replace(/toast--\w+|alert--\w+/g, "").trim();
          toast.classList.add("show");
          toast.classList.add(`toast--${type}`);
          if (this.timeout) clearTimeout(this.timeout);
          this.timeout = setTimeout(() => {
            toast.classList.remove("show");
          }, 3000);
          return;
        }
      }

      // Fallback: create minimal inline notification if no element exists
      let fallback = $("#vexo-admin-fallback-toast");
      if (!fallback) {
        fallback = document.createElement("div");
        fallback.id = "vexo-admin-fallback-toast";
        fallback.style.cssText = "position:fixed;right:16px;bottom:16px;background:#0B1A33;color:#fff;padding:12px 16px;border-radius:12px;z-index:9999;box-shadow:0 12px 24px rgba(0,0,0,.2);font-size:14px;transform:translateY(20px);opacity:0;transition:.3s;";
        document.body.appendChild(fallback);
      }
      fallback.textContent = message;
      fallback.style.opacity = "1";
      fallback.style.transform = "translateY(0)";
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        fallback.style.opacity = "0";
        fallback.style.transform = "translateY(20px)";
      }, 3000);
    },
  };

  /* ==================================================
     7. MODAL HELPERS - only if HTML has modals
  ================================================== */
  const modal = {
    open(selector) {
      const el = $(selector);
      if (!el) return;
      el.style.display = "grid";
      el.classList.add("open", "active");
      document.body.style.overflow = "hidden";
    },
    close(selector) {
      const el = $(selector);
      if (!el) return;
      el.style.display = "none";
      el.classList.remove("open", "active");
      document.body.style.overflow = "";
    },
    init() {
      // Generic close buttons [data-close-modal] or.modal-close
      $$("[data-close-modal],.modal-close,.admin-modal-close").forEach(btn => {
        btn.addEventListener("click", () => {
          const target = btn.getAttribute("data-close-modal") || btn.closest(".modal-overlay,.admin-modal-overlay,.modal,.admin-modal");
          if (typeof target === "string") {
            modal.close(target);
          } else if (target) {
            target.style.display = "none";
            target.classList.remove("open", "active");
            document.body.style.overflow = "";
          }
        });
      });
      // Click overlay to close
      $$(".modal-overlay,.admin-modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) {
            overlay.style.display = "none";
            overlay.classList.remove("open", "active");
            document.body.style.overflow = "";
          }
        });
      });
    },
  };

  /* ==================================================
     8. RENDERING - safe, uses existing DOM IDs
  ================================================== */
  const render = {
    dashboardStats() {
      // These IDs may exist in admin/index.html - safe check each
      const map = {
        totalCustomers: state.customers.length,
        totalLeads: state.leads.length,
        totalRequests: state.requests.length,
        pendingRequests: state.leads.filter(l => l.status === "new" || l.status === "contacted").length + state.requests.filter(r => r.status === "pending").length,
        totalQuotes: state.leads.filter(l => l.service && l.service.toLowerCase().includes("install") || l.status === "new").length,
        completedJobs: state.leads.filter(l => l.status === "completed").length + state.requests.filter(r => r.status === "completed").length,
        emergencyRequests: state.leads.filter(l => search.normalize(l.service).includes("emergency") || search.normalize(l.message).includes("emergency")).length,
      };

      Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id) || $(`#${id}`) || $(`[data-stat="${id}"]`);
        if (el) el.textContent = String(value);
      });

      // Also support data bindings like [data-count="customers"]
      const bindings = {
        customers: state.customers.length,
        leads: state.leads.length,
        requests: state.requests.length,
      };
      $$("[data-count]").forEach(el => {
        const key = el.getAttribute("data-count");
        if (bindings[key]!= null) el.textContent = String(bindings[key]);
      });
    },

    customers(list = state.customers) {
      const tbody = $("#customersTable tbody") || $("#customers-table tbody") || $("[data-table='customers'] tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!list.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 6;
        td.textContent = "No customers found.";
        td.style.textAlign = "center";
        td.style.padding = "32px";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      list.forEach(c => {
        const tr = document.createElement("tr");
        const nameTd = document.createElement("td");
        nameTd.textContent = c.name || "-";
        const emailTd = document.createElement("td");
        emailTd.textContent = c.email || "-";
        const phoneTd = document.createElement("td");
        phoneTd.textContent = c.phone || "-";
        const cityTd = document.createElement("td");
        cityTd.textContent = c.city || c.zip || "-";
        const dateTd = document.createElement("td");
        dateTd.textContent = c.createdAt? new Date(c.createdAt).toLocaleDateString() : "-";
        const actionsTd = document.createElement("td");
        actionsTd.innerHTML = `<button class="btn-sm btn-ghost" data-action="view-customer" data-id="${c.id}">View</button>`;

        tr.append(nameTd, emailTd, phoneTd, cityTd, dateTd, actionsTd);
        tbody.appendChild(tr);
      });
    },

    leads(list = state.leads) {
      const tbody = $("#leadsTable tbody") || $("#leads-table tbody") || $("[data-table='leads'] tbody") || $("#quotesTable tbody") || $("[data-table='quotes'] tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!list.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7;
        td.textContent = "No leads found.";
        td.style.textAlign = "center";
        td.style.padding = "32px";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      list.forEach(l => {
        const tr = document.createElement("tr");

        const nameTd = document.createElement("td");
        nameTd.textContent = l.name || "-";

        const serviceTd = document.createElement("td");
        serviceTd.textContent = l.service || "-";

        const statusTd = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = `badge badge-${l.status} status-${l.status}`;
        badge.textContent = l.status || "new";
        statusTd.appendChild(badge);

        const phoneTd = document.createElement("td");
        phoneTd.textContent = l.phone || "-";

        const zipTd = document.createElement("td");
        zipTd.textContent = l.zip || "-";

        const dateTd = document.createElement("td");
        dateTd.textContent = l.createdAt? new Date(l.createdAt).toLocaleDateString() : "-";

        const actionsTd = document.createElement("td");
        actionsTd.innerHTML = `<select class="input" style="height:32px;font-size:12px" data-action="change-status" data-id="${l.id}">${STATUSES.map(s => `<option value="${s}" ${s===l.status?'selected':''}>${s}</option>`).join("")}</select>`;

        tr.append(nameTd, serviceTd, statusTd, phoneTd, zipTd, dateTd, actionsTd);
        tbody.appendChild(tr);
      });

      // Bind status change
      $$("[data-action='change-status']").forEach(sel => {
        sel.addEventListener("change", (e) => {
          const id = e.target.getAttribute("data-id");
          const newStatus = e.target.value;
          data.updateLeadStatus(id, newStatus);
          notify.show(`Lead status updated to ${newStatus}`, "success");
          render.dashboardStats();
        });
      });
    },

    requests(list = state.requests) {
      const tbody = $("#requestsTable tbody") || $("#ordersTable tbody") || $("[data-table='requests'] tbody") || $("[data-table='orders'] tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!list.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 6;
        td.textContent = "No requests found.";
        td.style.textAlign = "center";
        td.style.padding = "32px";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      list.forEach(r => {
        const tr = document.createElement("tr");
        const nameTd = document.createElement("td");
        nameTd.textContent = r.customerName || r.name || "-";
        const serviceTd = document.createElement("td");
        serviceTd.textContent = r.service || "-";
        const statusTd = document.createElement("td");
        statusTd.innerHTML = `<span class="badge status-${r.status}">${r.status || "-"}</span>`;
        const dateTd = document.createElement("td");
        dateTd.textContent = r.date? new Date(r.date).toLocaleDateString() : "-";
        const amountTd = document.createElement("td");
        amountTd.textContent = r.amount? "$" + r.amount : "-";
        const actionsTd = document.createElement("td");
        actionsTd.textContent = "-";
        tr.append(nameTd, serviceTd, statusTd, dateTd, amountTd, actionsTd);
        tbody.appendChild(tr);
      });
    },

    services(list = state.services) {
      const tbody = $("#servicesTable tbody") || $("#productsTable tbody") || $("[data-table='services'] tbody") || $("[data-table='products'] tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      list.forEach(s => {
        const tr = document.createElement("tr");
        const nameTd = document.createElement("td");
        nameTd.textContent = s.name;
        const descTd = document.createElement("td");
        descTd.textContent = s.description || "-";
        const priceTd = document.createElement("td");
        priceTd.textContent = s.basePrice? "$" + s.basePrice : "-";
        const statusTd = document.createElement("td");
        statusTd.innerHTML = `<span class="badge ${s.active? "badge-completed" : "badge-cancelled"}">${s.active? "Active" : "Inactive"}</span>`;
        tr.append(nameTd, descTd, priceTd, statusTd);
        tbody.appendChild(tr);
      });
    },

    recentActivity() {
      const container = $("#recentActivity") || $("[data-widget='recent']") || $(".recent-activity");
      if (!container) return;
      const recent = sort.byField([...state.leads], "createdAt", "desc").slice(0, 5);
      container.innerHTML = "";
      if (!recent.length) {
        container.textContent = "No recent activity.";
        return;
      }
      recent.forEach(item => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line-2);font-size:14px;";
        const dot = document.createElement("span");
        dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:6px;flex-shrink:0;";
        const text = document.createElement("div");
        const title = document.createElement("div");
        title.textContent = `${item.name} - ${item.service}`;
        title.style.fontWeight = "600";
        const meta = document.createElement("div");
        meta.textContent = `${item.status} • ${item.zip || ""} • ${new Date(item.createdAt).toLocaleDateString()}`;
        meta.style.cssText = "font-size:12px;color:var(--muted);margin-top:2px;";
        text.append(title, meta);
        row.append(dot, text);
        container.appendChild(row);
      });
    },
  };

  /* ==================================================
     9. SEARCH & FILTER BINDINGS
  ================================================== */
  const interactions = {
    initSearch() {
      const searchInputs = $$("[data-search], #searchInput, #adminSearch,.search-input");
      searchInputs.forEach(input => {
        if (!(input instanceof HTMLInputElement)) return;
        const target = input.getAttribute("data-search") || input.getAttribute("data-table") || "all";
        const handler = U && U.debounce? U.debounce(() => {
          const q = input.value;
          if (target === "customers" || target === "all") {
            const filtered = search.filterByQuery(state.customers, q, ["name", "email", "phone", "city", "zip"]);
            render.customers(filtered);
          }
          if (target === "leads" || target === "all" || target === "quotes") {
            const filtered = search.filterByQuery(state.leads, q, ["name", "email", "phone", "service", "zip", "message", "status"]);
            render.leads(filtered);
          }
          if (target === "requests" || target === "orders" || target === "all") {
            const filtered = search.filterByQuery(state.requests, q, ["customerName", "service", "status"]);
            render.requests(filtered);
          }
        }, 250) : () => {
          const q = input.value;
          render.customers(search.filterByQuery(state.customers, q, ["name", "email", "phone"]));
          render.leads(search.filterByQuery(state.leads, q, ["name", "service", "status"]));
        };

        input.addEventListener("input", handler);
      });
    },

    initFilters() {
      $$("[data-filter-status]").forEach(sel => {
        sel.addEventListener("change", (e) => {
          const status = e.target.value;
          const table = e.target.getAttribute("data-filter-status") || "leads";
          if (table === "leads" || table === "quotes") {
            render.leads(filter.byStatus(state.leads, status));
          } else if (table === "requests" || table === "orders") {
            render.requests(filter.byStatus(state.requests, status));
          }
        });
      });

      $$("[data-filter-service]").forEach(sel => {
        sel.addEventListener("change", (e) => {
          const service = e.target.value;
          render.leads(filter.byService(state.leads, service));
        });
      });
    },

    initSorting() {
      $$("[data-sort]").forEach(btn => {
        btn.addEventListener("click", () => {
          const field = btn.getAttribute("data-sort");
          const dir = btn.getAttribute("data-dir") || "desc";
          const table = btn.getAttribute("data-table") || "leads";
          const newDir = dir === "asc"? "desc" : "asc";
          btn.setAttribute("data-dir", newDir);

          if (table === "customers") render.customers(sort.byField(state.customers, field, newDir));
          if (table === "leads" || table === "quotes") render.leads(sort.byField(state.leads, field, newDir));
          if (table === "requests" || table === "orders") render.requests(sort.byField(state.requests, field, newDir));
        });
      });
    },

    initNavigation() {
      // Highlight active nav based on current file
      const path = window.location.pathname.split("/").pop() || "index.html";
      $$(".sidebar-nav a,.admin-nav a,.nav-item,.menu-item").forEach(a => {
        const href = a.getAttribute("href") || "";
        if (href && (href.includes(path) || (path === "" && href.includes("index.html")))) {
          a.classList.add("active");
        }
        // Support old naming: products -> services, orders -> requests
        if ((path.includes("products") && href.includes("services")) || (path.includes("services") && href.includes("products"))) {
          // keep both active for legacy html
        }
      });

      // Sidebar toggle button if exists
      const toggleBtn = $("#sidebarToggle, [data-toggle-sidebar],.sidebar-toggle");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          const sidebar = $(".sidebar,.admin-sidebar,.sidenav");
          if (sidebar) sidebar.classList.toggle("open");
        });
      }
    },
  };

  /* ==================================================
     10. PAGE DETECTION & INIT
  ================================================== */
  const pages = {
    detect() {
      const file = window.location.pathname.split("/").pop() || "index.html";
      state.currentPage = file.toLowerCase();
      return state.currentPage;
    },
    init() {
      const page = pages.detect();

      // Always render dashboard stats if elements exist
      render.dashboardStats();

      if (page.includes("index") || page === "" || page.includes("dashboard")) {
        render.leads();
        render.customers();
        render.requests();
        render.services();
        render.recentActivity();
      } else if (page.includes("customer")) {
        render.customers();
      } else if (page.includes("product") || page.includes("service")) {
        render.services();
      } else if (page.includes("order") || page.includes("request") || page.includes("lead") || page.includes("quote")) {
        render.leads();
        render.requests();
      } else if (page.includes("settings")) {
        // Settings page - populate settings if form exists
        const companyInput = $("#companyName, [name='companyName']");
        const cityInput = $("#city, [name='city']");
        const phoneInput = $("#settingsPhone, [name='phone']");
        if (companyInput && state.settings.companyName) companyInput.value = state.settings.companyName;
        if (cityInput && state.settings.city) cityInput.value = state.settings.city;
        if (phoneInput && state.settings.phone) phoneInput.value = state.settings.phone;
      }

      // These inits are safe on every admin page
      interactions.initSearch();
      interactions.initFilters();
      interactions.initSorting();
      interactions.initNavigation();
      modal.init();
      notify.init();
    },
  };

  /* ==================================================
     11. AUTH CHECK - do not duplicate auth.js logic
  ================================================== */
  const authCheck = {
    // Placeholder for future integration with auth.js
    // Checks if window.VexoAuth exists and has isAuthenticated
    isAdmin() {
      try {
        if (window.VexoAuth && typeof window.VexoAuth.isAuthenticated === "function") {
          return window.VexoAuth.isAuthenticated();
        }
        // If no auth system, allow for frontend dev - real security is server side
        return true;
      } catch {
        return true;
      }
    },
  };

  /* ==================================================
     12. PUBLIC API - for future Firebase integration
  ================================================== */
  return {
    state,
    data,
    search,
    filter,
    sort,
    render,
    notify,
    modal,
    authCheck,
    // Future Firebase hooks - keep empty for now
    _firebaseReady: false,
    _onFirebaseReady: null,
    init() {
      try {
        data.load();
        if (!authCheck.isAdmin()) {
          // Do not redirect here - auth.js handles redirects
          console.warn("Admin auth check failed - auth.js should handle redirect");
          return;
        }
        pages.init();
      } catch (e) {
        console.warn("VexoAdmin init failed:", e);
      }
    },
  };
})();

// Auto init when DOM ready - safe for all admin pages
document.addEventListener("DOMContentLoaded", () => {
  VexoAdmin.init();
});

// Expose globally for other scripts and future Firebase glue
if (typeof window!== "undefined") {
  window.VexoAdmin = window.VexoAdmin || VexoAdmin;
}
