"use strict";

/**
 * VEXO HVAC - js/app.js
 * Frontend behavior only for public index.html
 * No backend, no Firebase, no admin logic
 * Uses only existing IDs/classes from approved index.html
 */

document.addEventListener("DOMContentLoaded", () => {
  /* ==================================================
     1. DOM REFERENCES - only elements that exist in index.html
  ================================================== */
  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobileMenu");
  const estimateForm = document.getElementById("estimateForm");
  const formNotice = document.getElementById("formNotice");
  const toast = document.getElementById("toast");
  const navLinks = document.querySelectorAll(".nav-links a");
  const sections = document.querySelectorAll("section[id]");
  const telLinks = document.querySelectorAll('a[href^="tel:"]');
  // Include both #hash and ./index.html#hash for smooth scrolling
  const anchorLinks = document.querySelectorAll('a[href*="#"]');

  /* ==================================================
     2. GLOBAL STATE
  ================================================== */
  let toastTimeout = null;

  /* ==================================================
     3. UTILITY FUNCTIONS
  ================================================== */
  const isElement = (el) => el instanceof HTMLElement;

  const safeAddClass = (el, className) => {
    if (isElement(el)) el.classList.add(className);
  };

  const safeRemoveClass = (el, className) => {
    if (isElement(el)) el.classList.remove(className);
  };

  const getTargetIdFromHref = (href) => {
    if (!href || typeof href !== "string") return null;
    const hashIndex = href.indexOf("#");
    if (hashIndex === -1) return null;
    const id = href.slice(hashIndex + 1).trim();
    return id || null;
  };

  const isSamePageAnchor = (href) => {
    if (!href) return false;
    if (href.startsWith("tel:")) return false;
    if (!href.includes("#")) return false;
    const targetId = getTargetIdFromHref(href);
    if (!targetId) return false;
    // Exclude links to other pages like ./page/about.html, ./page/gallery.html
    const base = href.split("#")[0];
    // If base contains "page/" or is an html file other than index.html, treat as external
    if (base.includes("page/")) return false;
    if (base && base !== "" && base !== "./" && base !== "/" && base !== "./index.html" && base !== "index.html" && !base.startsWith("#")) {
      // If base is something like "./page/contact.html" or "about.html" -> external
      // Only allow empty base or index.html variants as same-page
      if (base.endsWith(".html") && !base.endsWith("index.html")) return false;
    }
    return !!document.getElementById(targetId);
  };

  /* ==================================================
     4. TOAST - uses existing.toast and.show
  ================================================== */
  function showToast(message) {
    if (!isElement(toast)) return;
    toast.textContent = message || "Done";
    safeAddClass(toast, "show");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      safeRemoveClass(toast, "show");
    }, 2600);
  }

  /* ==================================================
     5. MOBILE MENU - uses.hamburger,.mobile,.active,.open
  ================================================== */
  function initMobileMenu() {
    if (!isElement(hamburger) || !isElement(mobileMenu)) return;

    if (!hamburger.hasAttribute("aria-expanded")) {
      hamburger.setAttribute("aria-expanded", "false");
    }
    if (!hamburger.hasAttribute("aria-controls") && mobileMenu.id) {
      hamburger.setAttribute("aria-controls", mobileMenu.id);
    }

    const openMenu = () => {
      safeAddClass(hamburger, "active");
      safeAddClass(mobileMenu, "open");
      hamburger.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    };

    const closeMenu = () => {
      safeRemoveClass(hamburger, "active");
      safeRemoveClass(mobileMenu, "open");
      hamburger.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };

    const toggleMenu = () => {
      const isOpen = mobileMenu.classList.contains("open");
      if (isOpen) closeMenu();
      else openMenu();
    };

    hamburger.addEventListener("click", toggleMenu);

    const mobileLinks = mobileMenu.querySelectorAll('a[href^="#"], a[href*="#"], a[href^="tel:"]');
    mobileLinks.forEach((link) => {
      link.addEventListener("click", () => {
        closeMenu();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileMenu.classList.contains("open")) {
        closeMenu();
        hamburger.focus();
      }
    });

    document.addEventListener("click", (e) => {
      if (!mobileMenu.classList.contains("open")) return;
      const target = e.target;
      if (!mobileMenu.contains(target) && !hamburger.contains(target)) {
        closeMenu();
      }
    });
  }

  /* ==================================================
     6. DESKTOP NAVIGATION - active state on scroll
     Fixed to handle both #services and ./index.html#services
  ================================================== */
  function initDesktopNav() {
    if (!navLinks.length || !sections.length) return;

    let ticking = false;

    const updateActiveNav = () => {
      let currentId = "";
      const scrollOffset = 120;

      sections.forEach((section) => {
        const top = section.offsetTop - scrollOffset;
        if (window.scrollY >= top) {
          currentId = section.getAttribute("id");
        }
      });

      navLinks.forEach((link) => {
        const href = link.getAttribute("href");
        if (!isSamePageAnchor(href)) return;
        const targetId = getTargetIdFromHref(href);
        if (targetId === currentId) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      });

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateActiveNav);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    updateActiveNav();
  }

  /* ==================================================
     7. SMOOTH SCROLLING - respect existing CSS smooth
  ================================================== */
  function initSmoothScrolling() {
    if (!anchorLinks.length) return;

    anchorLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") return;
      if (href.startsWith("tel:")) return;
      if (!isSamePageAnchor(href)) return;

      const targetId = getTargetIdFromHref(href);
      if (!targetId) return;
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      link.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        try {
          history.pushState(null, "", "#" + targetId);
        } catch (err) {
          // Ignore history errors
        }
      });
    });
  }

  /* ==================================================
     8. FORM VALIDATION - uses actual fields in index.html
  ================================================== */
  function initFormValidation() {
    if (!isElement(estimateForm)) return;

    const getField = (name) => estimateForm.elements.namedItem(name);

    const firstName = getField("firstName");
    const lastName = getField("lastName");
    const phone = getField("phone");
    const email = getField("email");
    const zip = getField("zip");
    const service = getField("service");

    // FIXED: was fields = .filter(Boolean) bug;
    const fields = [firstName, lastName, phone, email, zip, service].filter(Boolean);

    fields.forEach((field) => {
      field.addEventListener("input", () => {
        field.setCustomValidity("");
        field.removeAttribute("aria-invalid");
      });
    });

    function validateForm() {
      let isValid = true;
      let firstInvalid = null;

      const setInvalid = (field, message) => {
        if (!field) return;
        field.setCustomValidity(message);
        field.setAttribute("aria-invalid", "true");
        if (!firstInvalid) firstInvalid = field;
        isValid = false;
      };

      if (firstName) {
        const val = firstName.value.trim();
        if (!val) {
          setInvalid(firstName, "Please enter your first name.");
        } else if (val.length < 2) {
          setInvalid(firstName, "First name must be at least 2 characters.");
        } else {
          firstName.setCustomValidity("");
        }
      }

      if (lastName) {
        const val = lastName.value.trim();
        if (!val) {
          setInvalid(lastName, "Please enter your last name.");
        } else if (val.length < 2) {
          setInvalid(lastName, "Last name must be at least 2 characters.");
        } else {
          lastName.setCustomValidity("");
        }
      }

      if (phone) {
        const val = phone.value.trim();
        const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;
        const digits = val.replace(/\D/g, "");
        if (!val) {
          setInvalid(phone, "Please enter your phone number.");
        } else if (digits.length < 10 || digits.length > 15) {
          setInvalid(phone, "Please enter a valid phone number (10-15 digits).");
        } else if (!phoneRegex.test(val)) {
          setInvalid(phone, "Please enter a valid phone number.");
        } else {
          phone.setCustomValidity("");
        }
      }

      if (email) {
        const val = email.value.trim();
        if (val) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(val)) {
            setInvalid(email, "Please enter a valid email address.");
          } else {
            email.setCustomValidity("");
          }
        } else {
          email.setCustomValidity("");
        }
      }

      if (zip) {
        const val = zip.value.trim();
        const zipRegex = /^\d{5}(-\d{4})?$/;
        if (!val) {
          setInvalid(zip, "Please enter your ZIP code.");
        } else if (!zipRegex.test(val)) {
          setInvalid(zip, "Please enter a valid 5-digit ZIP code.");
        } else {
          zip.setCustomValidity("");
        }
      }

      if (service) {
        const val = service.value;
        if (!val) {
          setInvalid(service, "Please select a service.");
        } else {
          service.setCustomValidity("");
        }
      }

      if (!isValid && firstInvalid) {
        firstInvalid.focus();
        if (typeof firstInvalid.reportValidity === "function") {
          firstInvalid.reportValidity();
        }
      }

      return isValid;
    }

    estimateForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const valid = validateForm();
      if (!valid) {
        showToast("Please fix the highlighted fields.");
        return;
      }

      if (isElement(formNotice)) {
        formNotice.textContent =
          "Thanks! Your estimate request has been prepared successfully. This is a demo — no data was sent to a server yet.";
        formNotice.style.display = "block";
        formNotice.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      showToast("Request prepared successfully — demo mode.");
      estimateForm.reset();

      fields.forEach((f) => {
        if (f) {
          f.setCustomValidity("");
          f.removeAttribute("aria-invalid");
        }
      });
    });
  }

  /* ==================================================
     10. OTHER EXISTING INTERACTIONS - tel: links
  ================================================== */
  function initTelLinks() {
    if (!telLinks.length) return;
    telLinks.forEach((link) => {
      link.addEventListener("click", () => {
        showToast("Opening phone dialer...");
      });
    });
  }

  /* ==================================================
     11. HERO VIDEO - STATIC BACKGROUND, NO PARALLAX
     - Fixed, covers hero fully with object-fit: cover
     - No scroll listener, no transform, no translate
     - Autoplay muted loop playsinline preserved in HTML
  ================================================== */
  function initHeroVideo() {
    const hero = document.getElementById("home");
    const video = hero ? hero.querySelector(".hero-video") : null;
    if (!hero || !isElement(video)) return;

    // Scroll-scrub mode:
    // The video does NOT autoplay. Page scroll controls video.currentTime.
    video.muted = true;
    video.loop = false;
    video.autoplay = false;
    video.pause();

    const reveals = hero.querySelectorAll(".hero-reveal");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let duration = 0;
    let ticking = false;

    const header = document.getElementById("header");
    const videoWrap = hero.querySelector(".hero-video-wrap");

    // The video is a real fixed viewport layer while the hero is active.
    // Scrolling changes ONLY video.currentTime; it never translates the video.
    const updateHeroFixedState = () => {
      if (!header || !videoWrap) return;
      const headerRect = header.getBoundingClientRect();
      const headerHeight = Math.max(0, Math.round(headerRect.height));
      hero.style.setProperty("--hero-header-h", headerHeight + "px");

      const rect = hero.getBoundingClientRect();
      const active = rect.top <= headerHeight && rect.bottom > headerHeight;
      videoWrap.classList.toggle("is-active", active);
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const update = () => {
      ticking = false;

      const scrollStart = hero.offsetTop;
      const scrollDistance = Math.max(1, hero.offsetHeight - window.innerHeight);
      const progress = clamp(
        (window.scrollY - scrollStart) / scrollDistance,
        0,
        1
      );

      if (Number.isFinite(duration) && duration > 0) {
        // requestVideoFrameCallback is not required; setting currentTime
        // directly keeps the scroll position as the video's playhead.
        const targetTime = progress * duration;

        // Avoid unnecessary seeks on tiny scroll changes.
        if (Math.abs(video.currentTime - targetTime) > 0.01) {
          try {
            video.currentTime = targetTime;
          } catch (_) {}
        }
      }

      // Text appears only near the end of the video.
      const revealProgress = clamp((progress - 0.94) / 0.06, 0, 1);
      hero.style.setProperty("--hero-scrub-progress", progress.toFixed(4));
      hero.style.setProperty("--hero-content-progress", revealProgress.toFixed(4));

      reveals.forEach((el) => {
        if (progress >= 0.94) {
          el.classList.add("is-visible");
        } else {
          el.classList.remove("is-visible");
        }
      });
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        updateHeroFixedState();
        update();
      });
    };

    const onLoadedMetadata = () => {
      duration = video.duration || 0;
      video.pause();
      video.currentTime = 0;
      requestUpdate();
    };

    if (video.readyState >= 1) {
      duration = video.duration || 0;
      video.pause();
      try { video.currentTime = 0; } catch (_) {}
    } else {
      video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    }

    // Ensure the browser does not start playing it automatically.
    video.addEventListener("play", () => {
      if (!reduceMotion.matches) video.pause();
    });

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    // Respect reduced motion: keep the first frame instead of scrubbing.
    if (reduceMotion.matches) {
      video.pause();
      try { video.currentTime = 0; } catch (_) {}
      reveals.forEach((el) => el.classList.add("is-visible"));
    }

    if (typeof reduceMotion.addEventListener === "function") {
      reduceMotion.addEventListener("change", (event) => {
        if (event.matches) {
          video.pause();
          try { video.currentTime = 0; } catch (_) {}
          reveals.forEach((el) => el.classList.add("is-visible"));
        } else {
          reveals.forEach((el) => el.classList.remove("is-visible"));
          requestUpdate();
        }
      });
    }

    updateHeroFixedState();
    requestUpdate();
  }

  /* ==================================================
     12. INITIALIZATION
  ================================================== */
  try {
    initMobileMenu();
  } catch (err) {
    console.warn("Mobile menu init failed:", err);
  }

  try {
    initDesktopNav();
  } catch (err) {
    console.warn("Desktop nav init failed:", err);
  }

  try {
    initSmoothScrolling();
  } catch (err) {
    console.warn("Smooth scrolling init failed:", err);
  }

  try {
    initFormValidation();
  } catch (err) {
    console.warn("Form validation init failed:", err);
  }

  try {
    initTelLinks();
  } catch (err) {
    console.warn("Tel links init failed:", err);
  }

  try {
    initHeroVideo();
  } catch (err) {
    console.warn("Hero video init failed:", err);
  }
});

