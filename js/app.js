"use strict";

/**
• VEXO HVAC - js/app.js • Frontend behavior only for public index.html • No backend, no Firebase, no admin logic • Uses only existing IDs/classes from approved index.html
 */ 
document.addEventListener("DOMContentLoaded", () => {
  /* ==============================================
1. DOM REFERENCES - only elements that exist in index.html
============================================== */
const hamburger = document.getElementById("hamburger");
const mobileMenu = document.getElementById("mobileMenu");
const estimateForm = document.getElementById("estimateForm");
const formNotice = document.getElementById("formNotice");
const toast = document.getElementById("toast");
const navLinks = document.querySelectorAll(".nav-links a");
const sections = document.querySelectorAll("section");
const telLinks = document.querySelectorAll('a[href^="tel:"]');
const anchorLinks = document.querySelectorAll('a[href^="#"]');

  /* ==================================================[id]
2. GLOBAL STATE
============================================== */
let toastTimeout = null;

  /* ==============================================
3. UTILITY FUNCTIONS
============================================== */
const isElement = (el) => el instanceof HTMLElement;

  const safeAddClass = (el, className) => {
    if (isElement(el)) el.classList.add(className);
  };

  const safeRemoveClass = (el, className) => {
    if (isElement(el)) el.classList.remove(className);
  };

  /* ==============================================
4. TOAST - uses existing.toast and.show
============================================== */
function showToast(message) {
if (!isElement(toast)) return;

    // Prefer textContent for safety - no unsanitized HTML injection
    toast.textContent = message || "Done";

    safeAddClass(toast, "show");

    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(() => {
      safeRemoveClass(toast, "show");
    }, 2600);
  }

  /* ==============================================
5. MOBILE MENU - uses.hamburger,.mobile,.active,.open
============================================== */
function initMobileMenu() {
if (!isElement(hamburger) ||!isElement(mobileMenu)) return;

    // Accessibility initial state
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
      // Prevent background scroll when menu is open
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
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    hamburger.addEventListener("click", toggleMenu);

    // Close when clicking a link inside mobile menu
    const mobileLinks = mobileMenu.querySelectorAll('a[href^="#"], a[href^="tel:"]');
    mobileLinks.forEach((link) => {
      link.addEventListener("click", () => {
        closeMenu();
      });
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileMenu.classList.contains("open")) {
        closeMenu();
        hamburger.focus();
      }
    });

    // Close when clicking outside mobile menu (on overlay area)
    document.addEventListener("click", (e) => {
      if (!mobileMenu.classList.contains("open")) return;
      const target = e.target;
      if (!mobileMenu.contains(target) &&!hamburger.contains(target)) {
        closeMenu();
      }
    });
  }

  /* ==============================================
6. DESKTOP NAVIGATION - active state on scroll
============================================== */
function initDesktopNav() {
if (!navLinks.length ||!sections.length) return;

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
        if (href === "#" + currentId) {
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
    // Initial call
    updateActiveNav();
  }

  /* ==============================================
7. SMOOTH SCROLLING - respect existing CSS smooth
============================================== */
function initSmoothScrolling() {
if (!anchorLinks.length) return;

    // Only handle same-page anchors that exist in DOM
    anchorLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") return;
      if (href.startsWith("#") && href.length > 1) {
        const targetId = href.slice(1);
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;

        link.addEventListener("click", (e) => {
          // Let browser handle if modifier keys pressed
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
          // Update URL without jumping
          history.pushState(null, "", href);
        });
      }
    });
  }

  /* ==============================================
8. FORM VALIDATION - uses actual fields in index.html
============================================== */
function initFormValidation() {
if (!isElement(estimateForm)) return;

    const getField = (name) => estimateForm.elements.namedItem(name);

    const firstName = getField("firstName");
    const lastName = getField("lastName");
    const phone = getField("phone");
    const email = getField("email");
    const zip = getField("zip");
    const service = getField("service");

    // Real-time cleanup of error state
    const fields =.filter(Boolean);
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

      // First Name - required
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

      // Last Name - required
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

      // Phone - required, reasonable format
      if (phone) {
        const val = phone.value.trim();
        // Accepts US formats, international with +, spaces, dashes, parentheses
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

      // Email - optional but validate if provided
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

      // ZIP - required
      if (zip) {
        const val = zip.value.trim();
        // US ZIP 5 digits or 5+4
        const zipRegex = /^\d{5}(-\d{4})?$/;
        if (!val) {
          setInvalid(zip, "Please enter your ZIP code.");
        } else if (!zipRegex.test(val)) {
          setInvalid(zip, "Please enter a valid 5-digit ZIP code.");
        } else {
          zip.setCustomValidity("");
        }
      }

      // Service - required select
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
        // Show native browser message
        if (typeof firstInvalid.reportValidity === "function") {
          firstInvalid.reportValidity();
        }
      }

      return isValid;
    }

    /* ==================================================[firstName][lastName][phone][email][zip][service]
9. FORM SUBMISSION - frontend only, no backend
============================================== */
estimateForm.addEventListener("submit", (e) => {
e.preventDefault();

      const valid = validateForm();
      if (!valid) {
        showToast("Please fix the highlighted fields.");
        return;
      }

      // Show existing.notice element
      if (isElement(formNotice)) {
        formNotice.textContent =
          "Thanks! Your estimate request has been prepared successfully. This is a demo — no data was sent to a server yet.";
        formNotice.style.display = "block";
        formNotice.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      showToast("Request prepared successfully — demo mode.");
      estimateForm.reset();

      // Clear any custom validity after reset
      fields.forEach((f) => {
        if (f) {
          f.setCustomValidity("");
          f.removeAttribute("aria-invalid");
        }
      });
    });
  }

  /* ==============================================
10. OTHER EXISTING INTERACTIONS - tel: links
============================================== */
function initTelLinks() {
if (!telLinks.length) return;

    telLinks.forEach((link) => {
      link.addEventListener("click", () => {
        showToast("Opening phone dialer...");
      });
    });
  }

  /* ==============================================
11. HERO VIDEO - minimal support for assets/videos/video.mp4 ◦ Does NOT recreate/inject video ◦ Does NOT replace with image ◦ Preserves autoplay muted loop playsinline • Lightweight parallax, respects reduced-motion
  ============================================== */
  function initHeroVideo() {
    const heroVideo = document.querySelector(".hero-video");
    const hero = document.getElementById("home");
    if (!isElement(heroVideo) ||!isElement(hero)) return; 
    // Ensure video tries to autoplay without breaking muted/loop/playsinline
    // Browsers may block; catch silently
    try {
      const playPromise = heroVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {
          // Autoplay blocked - poster will remain, no UI change needed
        });
      }
    } catch (e) {
      // Ignore
    }

    // Respect reduced-motion preference
    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotionQuery.matches) return;

    let ticking = false;
    const speed = 0.22;

    const onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        const rect = hero.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          const offset = window.scrollY * speed;
          heroVideo.style.transform = "translate3d(0," + offset * 0.35 + "px,0) scale(1.06)";
        }
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Disable parallax listener if user enables reduced-motion later
    if (typeof reduceMotionQuery.addEventListener === "function") {
      reduceMotionQuery.addEventListener("change", function (e) {
        if (e.matches) {
          heroVideo.style.transform = "";
          window.removeEventListener("scroll", onScroll);
        }
      });
    }
  }

  /* ==============================================
12. INITIALIZATION
============================================== */
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
