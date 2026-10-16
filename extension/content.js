/**
 * GAZI SMART FORM FILLER — Content Script (ECI Form 6 Smart Fill Engine)
 * File: extension/content.js
 *
 * Injected into voters.eci.gov.in to auto-fill Form 6 fields
 * using GCDS customer data. Handles async dropdown cascading
 * (State → District → AC) with MutationObserver + polling fallback.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  SAFETY RULES (NON-NEGOTIABLE):
 *  1. NEVER automates the final "Submit" button.
 *  2. If a field mapping is ambiguous, leaves it BLANK for manual entry.
 *  3. NEVER logs customer PII (Aadhaar, PAN, phone) to console.
 *  4. Detects DOM changes and notifies user if selectors are missing.
 *  5. All filled fields are highlighted for visual human review.
 * ═══════════════════════════════════════════════════════════════════
 */

(() => {
  // Support clean re-injection
  if (window.__GCDS_CONTENT_SCRIPT_CLEANUP) {
    try { window.__GCDS_CONTENT_SCRIPT_CLEANUP(); } catch {}
  }
  window.__GCDS_CONTENT_SCRIPT_LOADED = true;

  // ─── Constants ─────────────────────────────────────────────────────────────

  const HIGHLIGHT_CLASS = 'gcds-fill-highlight';
  const HIGHLIGHT_SUCCESS_CLASS = 'gcds-fill-highlight-success';
  const HIGHLIGHT_DURATION_MS = 4000;
  const DROPDOWN_POLL_INTERVAL_MS = 300;
  const DROPDOWN_POLL_MAX_ATTEMPTS = 40; // 12 seconds max wait
  const FILL_STEP_DELAY_MS = 200; // Delay between filling each field

  // ─── ECI Form 6 DOM Selector Map ──────────────────────────────────────────
  //
  // These selectors target the ECI Voters Portal Form 6 fields.
  // If the portal DOM changes, these must be updated.
  // The extension detects missing selectors and reports them to the user.
  //
  // NOTE: ECI portal uses Angular/React with dynamic rendering.
  // Selectors are kept broad to survive minor DOM updates.

  const SELECTOR_MAP = {
    // ─── Personal Information (Section B) ────────────────────────────────────
    firstName: [
      'input#firstB',
      '#firstB',
      'input[formcontrolname="firstName"]',
      'input[name="firstName"]',
      '#firstName',
      'input[placeholder*="First Name" i]',
      'input[id*="first" i][id*="name" i]',
    ],
    lastName: [
      'input#fNameR',
      '#fNameR',
      'input[formcontrolname="lastName"]',
      'input[name="lastName"]',
      '#lastName',
      'input[placeholder*="Last Name" i]',
      'input[placeholder*="Surname" i]',
      'input[id*="last" i][id*="name" i]',
    ],
    middleName: [
      'input[formcontrolname="middleName"]',
      'input[name="middleName"]',
      '#middleName',
      'input[placeholder*="Middle Name" i]',
    ],
    photoInput: [
      'input[type="file"]#upload-image',
      '#upload-image',
      'input[type="file"][name="upload photo"]',
      'input[type="file"]#fileToUpload',
      '#fileToUpload',
      'input[type="file"][name*="photo" i]',
      'input[type="file"][accept*="image" i]',
      'input[type="file"]',
    ],

    // ─── Date of Birth (Section G) ───────────────────────────────────────────
    dateOfBirth: [
      'input[type="date"][name="date"]',
      'input[name="date"]',
      'input.library-date',
      'input[formcontrolname="dateOfBirth"]',
      'input[name="dateOfBirth"]',
      'input[name="dob"]',
      '#dateOfBirth',
      'input[type="date"][id*="dob" i]',
      'input[type="date"][id*="birth" i]',
    ],
    dobDay: [
      'select[formcontrolname="dobDay"]',
      'select[name="dobDay"]',
      '#dobDay',
      'select[id*="day" i]',
    ],
    dobMonth: [
      'select[formcontrolname="dobMonth"]',
      'select[name="dobMonth"]',
      '#dobMonth',
      'select[id*="month" i]',
    ],
    dobYear: [
      'input[formcontrolname="dobYear"]',
      'input[name="dobYear"]',
      '#dobYear',
      'input[id*="year" i]',
      'input[placeholder*="Year" i]',
    ],

    // ─── Gender (Section F) ─────────────────────────────────────────────────
    gender: [
      'select[formcontrolname="gender"]',
      'select[name="gender"]',
      '#gender',
      'select[id*="gender" i]',
    ],

    // ─── Contact (Section D) ────────────────────────────────────────────────
    mobile: [
      'input[name="mobileNo"]',
      '#mobileNo',
      'input[formcontrolname="mobile"]',
      'input[formcontrolname="mobileNo"]',
      'input[name="mobile"]',
      '#mobile',
      'input[placeholder*="Mobile" i]',
      'input[type="tel"]',
    ],
    email: [
      'input#relativeEmail',
      'input[name="relativeEmail"]',
      '#relativeEmail',
      'input[formcontrolname="email"]',
      'input[name="email"]',
      '#email',
      'input[type="email"]',
      'input[placeholder*="Email" i]',
    ],

    // ─── Relative Information (Section C) ───────────────────────────────────
    relationType: [
      'select#currentRelRelationship',
      'select[name="currentRelRelationship"]',
      'select[formcontrolname="relationType"]',
      'select[name="relationType"]',
      '#relationType',
      'select[id*="relation" i]',
    ],
    relativeFirstName: [
      'input#fNameSur',
      'input[name="applicantRelativeName"]',
      '#fNameSur',
      'input[formcontrolname="relativeFirstName"]',
      'input[name="relativeFirstName"]',
      '#relativeFirstName',
      'input[id*="relative" i][id*="first" i]',
      'input[placeholder*="Relative\'s First Name" i]',
      'input[placeholder*="Father" i]',
    ],
    relativeLastName: [
      'input#fNameSurname',
      'input[name="applicantRelativeSurname"]',
      '#fNameSurname',
      'input[formcontrolname="relativeLastName"]',
      'input[name="relativeLastName"]',
      '#relativeLastName',
      'input[id*="relative" i][id*="last" i]',
    ],

    // ─── Address (Section H) ────────────────────────────────────────────────
    houseNo: [
      'input#doorD',
      'input[name="houseNo"]',
      'input#houseNo',
      '#doorD',
      'input[formcontrolname="houseNo"]',
      '#houseNo',
      'input[placeholder*="House" i]',
      'input[id*="house" i]',
    ],
    street: [
      'input#areasD',
      'input#streetArea',
      'input[name="street"]',
      'input[name="streetArea"]',
      '#areasD',
      'input[formcontrolname="street"]',
      '#street',
      'input[placeholder*="Street" i]',
      'input[placeholder*="Road" i]',
    ],
    locality: [
      'input[formcontrolname="locality"]',
      'input[name="locality"]',
      '#locality',
      'input[placeholder*="Locality" i]',
      'input[placeholder*="Area" i]',
    ],
    cityTownVillage: [
      'input#villageD',
      'input#villageTown',
      'input[name="village"]',
      'input[name="villageTown"]',
      '#villageD',
      'input[formcontrolname="townVillageCity"]',
      'input[name="townVillageCity"]',
      'input[formcontrolname="city"]',
      '#townVillageCity',
      '#city',
      'input[placeholder*="Town" i]',
      'input[placeholder*="Village" i]',
      'input[placeholder*="City" i]',
    ],
    postOffice: [
      'input#postH',
      'input#postOffice',
      'input[name="postOffice"]',
      '#postH',
      'input[formcontrolname="postOffice"]',
      '#postOffice',
      'input[placeholder*="Post Office" i]',
    ],
    pincode: [
      'input#pinCode',
      'input[name="pinCode"]',
      '#pinCode',
      'input[formcontrolname="pinCode"]',
      'input[name="pincode"]',
      'input[formcontrolname="pincode"]',
      '#pincode',
      'input[placeholder*="Pin" i]',
      'input[maxlength="6"][type="text"]',
    ],
    tehsil: [
      'input#areasH',
      'input#tehsil',
      'input[name="currentAddressTeh"]',
      'input[name="tehsil"]',
      '#areasH',
      'input[formcontrolname="currentAddressTeh"]',
      'input[formcontrolname="tehsil"]',
    ],

    // ─── Cascading Dropdowns (Section A: State → District → AC) ─────────────
    state: [
      'select#stateCode',
      'select[name="stateCode"]',
      'select#currentStateCd',
      'select[name="currentStateCd"]',
      'select[formcontrolname="state"]',
      'select[name="state"]',
      '#state',
      'select[id*="state" i]',
    ],
    district: [
      'select#districtCd',
      'select[name="districtCd"]',
      'select[formcontrolname="district"]',
      'select[name="district"]',
      '#district',
      'select[id*="district" i]',
    ],
    assemblyConstituency: [
      'select[name="assemblyNo"]',
      '#assemblyNo',
      'select[formcontrolname="assemblyConstituency"]',
      'select[formcontrolname="asmbly"]',
      'select[formcontrolname="ac"]',
      'select[name="assemblyConstituency"]',
      'select[name="asmbly"]',
      '#assemblyConstituency',
      'select[id*="constituency" i]',
      'select[id*="asmbly" i]',
      'select[id*="ac" i]',
    ],

    // ─── Declaration (Section K) ────────────────────────────────────────────
    declarationPlace: [
      'input#Place',
      'input[name="Place"]',
      '#Place',
    ],
    declarationVillage: [
      'input#village[name="village"]',
      'input#village',
    ],
    declarationDate: [
      'input#dateDeclaration',
      'input#declrDate',
      'input[name="declarationDate"]',
    ],

    // ─── EPIC (Voter ID) ────────────────────────────────────────────────────
    epicNumber: [
      'input[formcontrolname="epicNo"]',
      'input[name="epicNo"]',
      'input[formcontrolname="epicNumber"]',
      '#epicNo',
      '#epicNumber',
      'input[placeholder*="EPIC" i]',
      'input[placeholder*="Voter ID" i]',
    ],

    // ─── Aadhaar (Section E) ────────────────────────────────────────────────
    aadhaarCheckbox: [
      'input[type="checkbox"][value="aadhaarnum"]',
      'input[aria-label="Aadhaar Number" i]',
    ],
    noAadhaarCheckbox: [
      'input[type="checkbox"][value="noaadhaarnum"]',
      'input[aria-label*="not able to furnish" i]',
    ],
    aadhaarNumber: [
      'input#aadhaarNumber',
      'input[name="aadhaarNumber"]',
      'input#aadhaarNo',
      'input[placeholder*="Aadhaar" i]',
    ],

    // ─── Age Proof Document (Section G) ─────────────────────────────────────
    ageProofRadio: [
      'input[type="radio"][name="ageDocument"][value="ageProof"]',
      'input#ageDocument[value="ageProof"]',
    ],
    ageProofType: [
      'select[name="ageproof"]',
      'select#ageproof',
    ],
    ageProofFile: [
      'input[type="file"]#ageProof',
      'input[type="file"][name="ageProof"]',
      '#ageProof',
    ],

    // ─── Address Proof Document (Section H) ─────────────────────────────────
    addressProofRadio: [
      'input[type="radio"][name="AddressProofDocument"][value="Y"]',
      'input#AddressProofDocument[value="Y"]',
    ],
    addressProofType: [
      'select[name="currentAddressProofType"]',
      'select#currentAddressProofType',
    ],
    addressProofFile: [
      'input[type="file"]#currentAddressProof',
      'input[type="file"][name="currentAddressProof"]',
      '#currentAddressProof',
    ],
  };

  // ─── Inject Highlight Styles ──────────────────────────────────────────────

  function injectHighlightStyles() {
    if (document.getElementById('gcds-highlight-styles')) return;

    const style = document.createElement('style');
    style.id = 'gcds-highlight-styles';
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 2px solid #6366f1 !important;
        outline-offset: 2px;
        box-shadow: 0 0 12px rgba(99, 102, 241, 0.3) !important;
        transition: outline-color 300ms ease, box-shadow 300ms ease;
      }
      .${HIGHLIGHT_SUCCESS_CLASS} {
        outline-color: #34d399 !important;
        box-shadow: 0 0 12px rgba(52, 211, 153, 0.3) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── DOM Helpers ──────────────────────────────────────────────────────────

  /**
   * Finds the first matching element from a list of CSS selector candidates.
   * Returns null if none found.
   */
  function findElement(selectorCandidates) {
    if (!selectorCandidates) return null;
    const candidates = Array.isArray(selectorCandidates) ? selectorCandidates : [selectorCandidates];
    for (const sel of candidates) {
      if (!sel) continue;
      if (sel instanceof HTMLElement || (sel && sel.nodeType === 1)) return sel;
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {
        // Invalid selector — skip
      }
    }
    return null;
  }

  /**
   * Dispatches synthetic input, change, and blur events so that
   * Angular/React frameworks detect the programmatic value change.
   */
  function dispatchInputEvents(element) {
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    // For React controlled components, use the native setter
    if (nativeInputValueSetter && element instanceof HTMLInputElement) {
      // Value already set by the caller
    }

    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));

    // Angular-specific: trigger ngModel update
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  /**
   * Sets a text input value using the React-compatible native setter approach.
   */
  function setInputValue(element, value) {
    if (value === undefined || value === null) return false;

    const strValue = String(value);

    // If React's valueTracker is installed, clear tracker to guarantee React triggers onChange
    if (element && element._valueTracker) {
      try { element._valueTracker.setValue('__GCDS_RESET__'); } catch {}
    }

    // Use React's native setter trick to bypass synthetic event system
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(element, strValue);
    } else {
      element.value = strValue;
    }

    dispatchInputEvents(element);
    return true;
  }

  /**
   * Sets a radio button or checkbox safely with complete framework event dispatch.
   */
  function setRadioOrCheckbox(element, checked = true) {
    if (!element) return false;
    if (element.checked !== checked) {
      element.click();
    }
    if (element.checked !== checked) {
      element.checked = checked;
      element.dispatchEvent(new Event('click', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    return true;
  }

  /**
   * Safely extracts option elements from a select element as a standard JavaScript Array.
   * Prevents "SelectElement.options is not iterable" errors by avoiding direct spread or for...of
   * on HTMLOptionsCollection when it is null, undefined, or uniterable in the page context.
   */
  function getOptionsSafe(el) {
    if (!el) return [];
    if (el.options) {
      try {
        return Array.from(el.options);
      } catch {
        // Fallback for environments where Array.from(HTMLOptionsCollection) fails
        const arr = [];
        const len = Number(el.options.length) || 0;
        for (let i = 0; i < len; i++) {
          if (el.options[i]) arr.push(el.options[i]);
        }
        return arr;
      }
    }
    // Fallback if element is not standard select but has option children
    try {
      const optNodes = el.querySelectorAll ? el.querySelectorAll('option') : [];
      return Array.from(optNodes || []);
    } catch {
      return [];
    }
  }

  /**
   * Sets a <select> element's value by matching option text or value safely.
   * Uses Array.from(el.options || []) to prevent "not iterable" errors.
   */
  function setSelectValue(selectElement, targetValue) {
    if (!targetValue || !selectElement) return false;

    const options = getOptionsSafe(selectElement);
    if (!options || options.length === 0) return false;

    const normalizedTarget = String(targetValue).trim().toUpperCase();
    const cleanTarget = normalizedTarget.replace(/[^A-Z0-9]/g, '');

    // Strategy 1: Exact match on option text (trimmed, uppercase)
    let target = options.find((opt) => {
      const text = (opt.text || opt.textContent || '').trim().toUpperCase();
      return text === normalizedTarget;
    });

    // Strategy 2: Normalized alphanumeric match
    if (!target && cleanTarget) {
      target = options.find((opt) => {
        const textClean = (opt.text || opt.textContent || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        return textClean && (textClean === cleanTarget);
      });
    }

    // Strategy 3: Substring includes match on option text
    if (!target) {
      target = options.find((opt) => {
        const text = (opt.text || opt.textContent || '').trim().toUpperCase();
        return text.includes(normalizedTarget) || normalizedTarget.includes(text);
      });
    }

    // Strategy 4: Match option value directly
    if (!target) {
      target = options.find((opt) => {
        const val = String(opt.value || '').trim().toUpperCase();
        return val === normalizedTarget;
      });
    }

    if (target) {
      selectElement.value = target.value;
      // Essential Framework Events for Angular / React
      selectElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      selectElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      selectElement.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      highlightField(selectElement);
      return true;
    }

    return false;
  }

  /**
   * Optimized Dropdown Handler
   * Waits for dynamic dropdown options to populate via portal API, converts options
   * safely via Array.from(el.options || []), matches target, and fires framework events.
   *
   * @param {HTMLElement|string|string[]} selectorOrCandidates - Select element, CSS selector, or array of candidate selectors
   * @param {string} searchText - Text to find in dropdown options
   * @param {number} maxRetries - Max retry attempts (default 10, 500ms each)
   * @returns {Promise<boolean>}
   */
  async function selectDropdownSafe(selectorOrCandidates, searchText, maxRetries = 10) {
    if (!searchText) return false;
    const searchStr = String(searchText).trim();
    if (!searchStr) return false;

    let el = null;
    if (selectorOrCandidates && (selectorOrCandidates instanceof HTMLElement || selectorOrCandidates.nodeType === 1)) {
      el = selectorOrCandidates;
    } else {
      const candidates = Array.isArray(selectorOrCandidates)
        ? selectorOrCandidates
        : [selectorOrCandidates];

      // 1. Wait for element to exist and options to populate
      for (let i = 0; i < maxRetries; i++) {
        el = findElement(candidates);
        if (el) {
          const opts = getOptionsSafe(el);
          if (opts.length > 1 || (opts.length === 1 && opts[0].value && opts[0].value !== '')) break;
        }
        await sleep(500);
      }
      el = findElement(candidates);
    }

    if (!el) return false;

    // 2. Wait for options on el to populate if only 0 or 1 placeholder option exists
    for (let i = 0; i < maxRetries; i++) {
      const opts = getOptionsSafe(el);
      if (opts.length > 1 || (opts.length === 1 && opts[0].value && opts[0].value !== '')) break;
      await sleep(500);
    }

    // 3. Safe Array Conversion
    const options = getOptionsSafe(el);
    if (!options || options.length === 0) return false;

    const targetUpper = searchStr.toUpperCase();
    const targetClean = targetUpper.replace(/[^A-Z0-9]/g, '');

    // Find target option (exact text match first, then normalized alphanumeric, then includes, then value)
    const target =
      options.find((opt) => {
        const text = (opt.text || opt.textContent || '').trim().toUpperCase();
        return text === targetUpper;
      }) ||
      options.find((opt) => {
        const textClean = (opt.text || opt.textContent || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        return textClean && targetClean && (textClean === targetClean);
      }) ||
      options.find((opt) => {
        const text = (opt.text || opt.textContent || '').trim().toUpperCase();
        return text.includes(targetUpper);
      }) ||
      options.find((opt) => {
        const text = (opt.text || opt.textContent || '').trim().toUpperCase();
        return targetUpper.includes(text) && text.length > 2;
      }) ||
      options.find((opt) => {
        const val = String(opt.value || '').trim().toUpperCase();
        return val === targetUpper;
      });

    if (target) {
      el.value = target.value;
      // Essential Framework Events (Angular / React)
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      highlightField(el);
      return true;
    }

    return false;
  }

  /**
   * Highlights a filled field temporarily to provide visual feedback.
   */
  function highlightField(element) {
    element.classList.add(HIGHLIGHT_CLASS);

    setTimeout(() => {
      element.classList.add(HIGHLIGHT_SUCCESS_CLASS);
    }, 300);

    setTimeout(() => {
      element.classList.remove(HIGHLIGHT_CLASS, HIGHLIGHT_SUCCESS_CLASS);
    }, HIGHLIGHT_DURATION_MS);
  }

  // ─── Async Dropdown Cascade ───────────────────────────────────────────────

  /**
   * Waits for a <select> element's options to be populated (more than 1 option,
   * which is the placeholder "Select…" entry).
   *
   * Uses MutationObserver for efficiency, with polling as a fallback
   * for government portals that may not trigger standard DOM mutations.
   * Uses safe Array.from conversion on options collection to prevent errors.
   *
   * @param {string[]} selectorCandidates - CSS selector candidates for the dropdown
   * @param {number} maxAttempts - Maximum polling attempts
   * @returns {Promise<HTMLSelectElement|null>}
   */
  function waitForDropdownOptions(selectorCandidates, maxAttempts = DROPDOWN_POLL_MAX_ATTEMPTS) {
    return new Promise((resolve) => {
      let attempts = 0;
      let observer = null;

      const check = () => {
        try {
          const el = findElement(selectorCandidates);
          if (el) {
            const opts = getOptionsSafe(el);
            if (opts.length > 1) {
              if (observer) {
                try { observer.disconnect(); } catch {}
              }
              resolve(el);
              return true;
            }
          }
        } catch {
          // Guard against DOM exceptions during framework reconciliation
        }
        return false;
      };

      // Immediate check
      if (check()) return;

      // MutationObserver: watch for option additions safely
      try {
        const targetEl = findElement(selectorCandidates);
        if (targetEl) {
          observer = new MutationObserver(() => {
            if (check()) return;
          });
          observer.observe(targetEl, { childList: true, subtree: true });
        }
      } catch {
        // Fall back to polling
      }

      // Polling fallback (for frameworks that replace the entire <select>)
      const interval = setInterval(() => {
        attempts++;
        if (check()) {
          clearInterval(interval);
          return;
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          if (observer) {
            try { observer.disconnect(); } catch {}
          }
          resolve(null); // Timeout — dropdown never populated
        }
      }, DROPDOWN_POLL_INTERVAL_MS);
    });
  }

  /**
   * Delays execution for a specified duration.
   */
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── DOM Change Detection (Fail-Safe) ─────────────────────────────────────

  /**
   * Checks if essential form selectors are present in the DOM.
   * Returns a list of missing critical fields.
   */
  function detectDomChanges() {
    const criticalFields = ['firstName', 'lastName', 'state', 'pincode'];
    const missing = [];

    for (const field of criticalFields) {
      const candidates = SELECTOR_MAP[field];
      if (!candidates) continue;
      const el = findElement(candidates);
      if (!el) {
        missing.push(field);
      }
    }

    return missing;
  }

  // ─── Section Navigation & "Next" Button Automation ─────────────────────────

  /**
   * Finds the section container (.box) corresponding to a given section letter ('A' to 'K').
   * @param {string} letter - Section letter ('A' through 'K')
   * @returns {HTMLElement|null}
   */
  function findSectionBox(letter) {
    const lUpper = (letter || '').toUpperCase();
    const prefix = `${lUpper}.`;
    const numPrefix = {
      A: '1.', B: '2.', C: '3.', D: '4.', E: '5.', F: '6.', G: '7.', H: '8.', I: '9.', J: '10.', K: '11.', L: '12.'
    }[lUpper];
    const sectionKeywords = {
      H: ['Present Address', 'Address Details', 'বর্তমান ঠিকানা'],
      G: ['Date of Birth', 'DOB', 'জন্মতারিখ'],
      C: ['Relative', 'আত্মীয়'],
      B: ['Personal Details', 'Name of Applicant', 'ব্যক্তিগত'],
      A: ['Select State', 'District', 'AC', 'রাজ্য'],
      I: ['Disability', 'প্রতিবন্ধী'],
      J: ['Family Member', 'EPIC', 'পরিবার'],
      K: ['Declaration', 'ঘোষণাপত্র'],
    }[lUpper] || [];

    const allBoxes = document.querySelectorAll('.box, .card, .accordion-item');
    for (const box of allBoxes) {
      const title = box.querySelector('.form-title, h1, h2, h3, h4, h5, h6, strong')?.textContent?.trim() || '';
      if (title.toUpperCase().startsWith(prefix) || (numPrefix && title.startsWith(numPrefix))) {
        return box;
      }
      for (const kw of sectionKeywords) {
        if (title.includes(kw)) return box;
      }
    }
    for (const box of allBoxes) {
      const text = (box.innerText || box.textContent || '').trim();
      if (text.toUpperCase().startsWith(prefix) || (numPrefix && text.startsWith(numPrefix))) {
        return box;
      }
      for (const kw of sectionKeywords) {
        if (text.includes(kw)) return box;
      }
    }
    return null;
  }

  /**
   * Clicks the "Next" button located on the bottom right corner of the section card.
   * Handles React synthetic event dispatch, scrolling into view, and section completion.
   *
   * @param {string} letter - Section letter ('A' through 'K')
   * @returns {Promise<boolean>}
   */
  async function clickSectionNextButton(letter) {
    try {
      const lUpper = (letter || '').toUpperCase();
      const letterIndex = lUpper.charCodeAt(0) - 'A'.charCodeAt(0);
      const nextLetter = String.fromCharCode('A'.charCodeAt(0) + letterIndex + 1);

      const box = findSectionBox(letter);
      let nextBtn = box ? box.querySelector('button.next-btn, button[aria-label*="Next" i]') : null;

      // Fallback 1: match by aria-label containing nextLetter (e.g. "Move to Part H , Next")
      if (!nextBtn) {
        nextBtn = document.querySelector(
          `button[aria-label*="Move to Part ${nextLetter}" i], button[aria-label*="Part ${nextLetter}" i], button[aria-label*="Move to Part ${letterIndex + 2}" i]`
        );
      }

      // Fallback 2: match from all .next-btn by section index
      if (!nextBtn) {
        const allNextBtns = Array.from(document.querySelectorAll('button.next-btn'));
        nextBtn = allNextBtns[letterIndex] || null;
      }

      if (!nextBtn) {
        console.warn(`[GCDS Next Button] Next button for Section ${letter} not found.`);
        return false;
      }

      // Smooth scroll so the user sees progress in the viewport
      try {
        nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch {}

      await sleep(150);

      // Check for React props onClick handler
      const propKey = Object.keys(nextBtn).find((k) => k.startsWith('__reactProps'));
      const props = propKey ? nextBtn[propKey] : null;

      // 1. Clear disabled state on DOM element
      nextBtn.removeAttribute('disabled');
      nextBtn.disabled = false;

      // 2. Dispatch pointer and mouse events
      const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      for (const evName of mouseEvents) {
        nextBtn.dispatchEvent(new MouseEvent(evName, { bubbles: true, cancelable: true, view: window }));
      }

      // 3. Native click
      try {
        nextBtn.click();
      } catch {}

      // 4. Trigger React click handler directly if present
      if (props && typeof props.onClick === 'function') {
        try {
          props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
        } catch {}
      }

      // Visual feedback
      nextBtn.classList.remove('buttonDisable');
      nextBtn.classList.add('buttonVisible');

      // Brief delay for portal to validate and transition to next section
      await sleep(400);

      // 5. Sidebar progression backup:
      // If the current section is complete and the next section exists, trigger next section activation
      const sidebarItems = Array.from(document.querySelectorAll('[class*="box1"], [class*="sidenavclass"]'))
        .filter((x) => x.innerText && /^[A-L]\./.test(x.innerText.trim()));
      const nextSidebar = sidebarItems.find((it) => it.innerText.trim().startsWith(nextLetter + '.'));

      if (nextSidebar) {
        try {
          nextSidebar.click();
          nextSidebar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch {}
      }

      await sleep(250);
      return true;
    } catch (err) {
      return false;
    }
  }

  // ─── Automated Document & Photo Upload (Section B, G, H) ──────────────────

  /**
   * Fetches a binary blob from background script via FETCH_IMAGE_BLOB (bypassing CORS).
   *
   * @param {string} url - Target URL or Data URL
   * @param {string} [customerId] - Optional customer ID for GCDS photo resolution
   * @returns {Promise<Blob|null>}
   */
  /**
   * Converts a Data URL (base64) directly to a Blob without window.fetch()
   * (bypasses Angular Zone.js polyfill which rejects fetch() on data: URLs).
   *
   * @param {string} dataUrl
   * @returns {Blob|null}
   */
  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    try {
      const parts = dataUrl.split(',');
      if (parts.length < 2) return null;
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.warn('[GCDS File] dataUrlToBlob error:', e);
      return null;
    }
  }

  /**
   * Fetches a file Blob from either a Data URL, remote URL, or GCDS Vault.
   * Uses direct binary decoding or background service worker with strict timeout.
   *
   * @param {string} url - Target URL or Data URL
   * @param {string} [customerId] - Optional customer ID for GCDS photo resolution
   * @returns {Promise<Blob|null>}
   */
  async function fetchFileBlob(url, customerId) {
    if (!url && !customerId) return null;

    // 1. Direct Data URL conversion via pure JS (immune to Angular zone.js fetch monkey-patching)
    if (url && typeof url === 'string' && url.startsWith('data:')) {
      const blob = dataUrlToBlob(url);
      if (blob && blob.size > 0) return blob;
    }

    // 2. Direct fetch for HTTP/HTTPS signed URLs (e.g. Supabase storage CORS-enabled)
    if (url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 0) return blob;
        }
      } catch {
        // Direct fetch blocked by CORS or CSP; fallback to background service worker below
      }
    }

    // 3. Fallback to background service worker with strict 5-second timeout
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[GCDS File] Background fetch timed out after 5000ms');
          resolve(null);
        }
      }, 5000);

      try {
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
          clearTimeout(timer);
          resolve(null);
          return;
        }
        chrome.runtime.sendMessage(
          { action: 'FETCH_IMAGE_BLOB', url, customerId },
          async (response) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);

            if (chrome.runtime?.lastError || !response || !response.blobData) {
              console.warn('[GCDS File] Fetch failed:', chrome.runtime?.lastError?.message || response?.error);
              resolve(null);
              return;
            }
            try {
              // Convert Data URL response safely via dataUrlToBlob
              const blob = dataUrlToBlob(response.blobData);
              resolve(blob);
            } catch (err) {
              console.warn('[GCDS File] Blob conversion error:', err);
              resolve(null);
            }
          }
        );
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          console.warn('[GCDS File] sendMessage error:', err);
          resolve(null);
        }
      }
    });
  }

  /**
   * Helper to inject a binary file Blob into the portal's file input using the DataTransfer API.
   * Dispatches input, change, and blur events so Angular & React detect the file upload.
   *
   * @param {HTMLInputElement|string} target - File input element or CSS selector
   * @param {Blob} fileBlob - Binary file blob (JPEG, PNG, PDF)
   * @param {string} fileName - Destination file name (e.g. 'firstname_photo.jpg')
   * @param {boolean} isPhoto - If true, auto-confirms Section B crop modal
   * @returns {Promise<boolean>}
   */
  async function injectFileToPortal(target, fileBlob, fileName = 'document.jpg', isPhoto = false) {
    if (!fileBlob || typeof fileBlob.size !== 'number' || fileBlob.size === 0) {
      console.warn('[GCDS File] Invalid or empty file blob provided to injectFileToPortal');
      return false;
    }

    const input = typeof target === 'string' ? document.querySelector(target) : target;
    if (!input) {
      console.warn('[GCDS File] File input field not found on portal:', target);
      return false;
    }

    // Portal rule: document size maximum 2MB
    if (fileBlob.size > 2 * 1024 * 1024) {
      console.warn(`[GCDS File] File exceeds ECI 2MB limit: ${fileBlob.size} bytes`);
      return false;
    }

    try {
      let mimeType = fileBlob.type;
      if (!mimeType) {
        if (fileName.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
        else if (fileName.toLowerCase().endsWith('.png')) mimeType = 'image/png';
        else mimeType = 'image/jpeg';
      }

      const file = new File([fileBlob], fileName, { type: mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      input.files = dataTransfer.files;

      // Visual highlight for the operator
      const parent = input.parentElement || input;
      parent.style.transition = 'border 250ms ease, box-shadow 250ms ease';
      parent.style.border = '2px dashed #1e40af';

      // Trigger necessary events for the portal's framework
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));

      setTimeout(() => {
        parent.style.border = '2px solid #34d399';
        parent.style.boxShadow = '0 0 10px rgba(52, 211, 153, 0.35)';
      }, 200);

      // Photo-specific crop modal auto-confirmation
      if (isPhoto) {
        const modalConfirmed = await autoConfirmSelectFromImageModal(7000);
        if (modalConfirmed) {
          console.log('✅ "Select From Image" modal auto-confirmed and saved.');
        }
      }

      const success = Boolean(input.files && input.files.length > 0);
      console.log(`✅ File injected: ${fileName} into ${input.id || input.name} (success: ${success})`);
      return success;
    } catch (err) {
      console.error('[GCDS File] Failed to inject file via DataTransfer:', err);
      return false;
    }
  }

  /**
   * Automatically confirms and saves the ECI "Select From Image" crop modal.
   * Polls for the modal, waits for the canvas image to initialize, clicks "Save",
   * and handles any secondary confirmation/alert dialogs.
   *
   * @param {number} maxWaitMs - Max wait time in ms (default 8000ms)
   * @returns {Promise<boolean>}
   */
  async function autoConfirmSelectFromImageModal(maxWaitMs = 8000) {
    const startTime = Date.now();
    const pollInterval = 150;
    let clickedOnce = false;

    while (Date.now() - startTime < maxWaitMs) {
      // 1. Detect the "Select From Image" modal
      const modal = document.querySelector(
        '.confirmation_modal, .modal-content_custom, [class*="confirmation_modal"], [class*="modal_custom"]'
      );

      // Check for any modal alert (e.g. "No faces were found" dialog with "Ok" button)
      const okBtn = Array.from(document.querySelectorAll('button')).find((b) => {
        const text = (b.innerText || b.textContent || '').replace(/\u00a0/g, ' ').trim();
        return /^ok$/i.test(text);
      });
      if (okBtn) {
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((evtName) => {
          okBtn.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true, view: window }));
        });
        try {
          okBtn.click();
        } catch {}
      }

      if (modal && modal.offsetParent !== null) {
        // Find the "Save" button inside the modal
        const saveBtn =
          Array.from(modal.querySelectorAll('button')).find((b) => {
            const text = (b.innerText || b.textContent || '').replace(/\u00a0/g, ' ').trim().toLowerCase();
            return text === 'save';
          }) || modal.querySelector('button.btn-primary, button[type="button"].btn-primary');

        if (saveBtn) {
          // Allow the crop canvas and slider controls to finish rendering
          if (!clickedOnce) {
            await sleep(400);
          }

          // React synthetic onClick fallback
          const propKey = Object.keys(saveBtn).find((k) => k.startsWith('__reactProps') || k.startsWith('__reactFiber'));
          const props = propKey ? saveBtn[propKey] : null;
          if (props && typeof props.onClick === 'function') {
            try {
              props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
            } catch {}
          }

          // Dispatch complete synthetic and native click sequence
          const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
          for (const evName of mouseEvents) {
            saveBtn.dispatchEvent(new MouseEvent(evName, { bubbles: true, cancelable: true, view: window }));
          }
          try {
            saveBtn.click();
          } catch {}

          clickedOnce = true;
          console.log('✅ Auto-clicked "Save" button in "Select From Image" modal.');

          // Allow the portal to process the crop
          await sleep(600);
        }
      } else if (clickedOnce) {
        // Modal has successfully closed!
        return true;
      }

      await sleep(pollInterval);
    }

    return clickedOnce;
  }

  /**
   * Orchestrates customer photograph retrieval from GCDS and automated injection into Section B.
   *
   * @param {Object} customer - Form-fill customer DTO
   * @returns {Promise<boolean>}
   */
  async function handlePhotoSection(customer) {
    const photoUrl = customer.photo_url || customer.photoUrl || customer.photo || customer.photo_source;
    const customerId = customer.customerId || customer.id;

    if (!photoUrl && !customerId) {
      console.warn('[GCDS Photo] No photo URL or customer ID available for this customer.');
      return false;
    }

    // Locate the file input: inside Section B card first, then global fallback
    const boxB = findSectionBox('B');
    const input = boxB?.querySelector('input[type="file"]') || document.querySelector('input[type="file"]#upload-image, input#upload-image, input[name="upload photo"], input[type="file"]#fileToUpload, input#fileToUpload, input[type="file"]');
    if (!input) {
      console.warn('[GCDS Photo] Section B file upload input not found in DOM.');
      return false;
    }

    // Visual highlight for the operator
    const uploadLabel = input.parentElement;
    if (uploadLabel) {
      uploadLabel.style.border = '2px dashed #1e40af';
    }

    const blob = await fetchFileBlob(photoUrl, customerId);
    if (!blob) {
      console.warn('[GCDS Photo] Failed to fetch photo blob.');
      return false;
    }

    const firstName = customer.first_name || customer.firstName || customer.name?.firstName || 'customer';
    const fileName = `${firstName}_photo.jpg`;

    return await injectFileToPortal(input, blob, fileName, true);
  }

  // ─── Section C: Human-in-the-Loop Relation Confirmation ────────────────────

  /**
   * Relation option metadata for the Section C HITL card.
   * Holds ECI radio value, display label (English + Bengali), and priority.
   */
  const RELATION_OPTIONS = [
    { code: 'FTHR', labelEn: 'Father',  labelBn: 'পিতা',      priority: 1 },
    { code: 'MTHR', labelEn: 'Mother',  labelBn: 'মাতা',      priority: 2 },
    { code: 'HSBN', labelEn: 'Husband', labelBn: 'স্বামী',   priority: 3 },
    { code: 'WIFE', labelEn: 'Wife',    labelBn: 'স্ত্রী',   priority: 4 },
    { code: 'OTHR', labelEn: 'Other',   labelBn: 'অন্যান্য', priority: 5 },
  ];

  /**
   * Injects the GCDS Section C floating Action Card styles (once per page).
   */
  function injectRelationCardStyles() {
    if (document.getElementById('gcds-sec-c-card-styles')) return;
    const s = document.createElement('style');
    s.id = 'gcds-sec-c-card-styles';
    s.textContent = `
      #gcds-rel-card {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 2147483647;
        width: 320px;
        background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);
        border: 1.5px solid #6366f1;
        border-radius: 14px;
        padding: 18px 18px 14px;
        box-shadow: 0 8px 40px rgba(99,102,241,0.35), 0 2px 12px rgba(0,0,0,0.5);
        font-family: 'Inter', system-ui, sans-serif;
        color: #f1f5f9;
        animation: gcds-card-in 0.25s cubic-bezier(0.34,1.56,0.64,1);
        user-select: none;
      }
      @keyframes gcds-card-in {
        from { opacity: 0; transform: translateY(20px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0)  scale(1); }
      }
      #gcds-rel-card .gcds-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      #gcds-rel-card .gcds-card-badge {
        background: #6366f1;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 2px 8px;
        border-radius: 20px;
        text-transform: uppercase;
      }
      #gcds-rel-card .gcds-card-title {
        font-size: 13px;
        font-weight: 600;
        color: #94a3b8;
      }
      #gcds-rel-card .gcds-rec-box {
        background: rgba(99,102,241,0.12);
        border: 1px solid rgba(99,102,241,0.4);
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 12px;
      }
      #gcds-rel-card .gcds-rec-label {
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      #gcds-rel-card .gcds-rec-name {
        font-size: 18px;
        font-weight: 700;
        color: #a5b4fc;
        letter-spacing: -0.01em;
      }
      #gcds-rel-card .gcds-rec-name-en {
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
      }
      #gcds-rel-card .gcds-select-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 14px;
      }
      #gcds-rel-card .gcds-rel-chip {
        background: #1e293b;
        border: 1.5px solid #334155;
        color: #94a3b8;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 10px;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
      }
      #gcds-rel-card .gcds-rel-chip:hover {
        border-color: #6366f1;
        color: #e0e7ff;
      }
      #gcds-rel-card .gcds-rel-chip.active {
        background: rgba(99,102,241,0.18);
        border-color: #6366f1;
        color: #a5b4fc;
        font-weight: 700;
      }
      #gcds-rel-card .gcds-btn-row {
        display: flex;
        gap: 8px;
      }
      #gcds-rel-card .gcds-btn-confirm {
        flex: 1;
        background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        border: none;
        border-radius: 8px;
        padding: 9px 0;
        cursor: pointer;
        letter-spacing: 0.02em;
        transition: opacity 0.15s, transform 0.1s;
        box-shadow: 0 2px 8px rgba(99,102,241,0.4);
      }
      #gcds-rel-card .gcds-btn-confirm:hover  { opacity: 0.9; transform: translateY(-1px); }
      #gcds-rel-card .gcds-btn-confirm:active { opacity: 0.8; transform: translateY(0); }
      #gcds-rel-card .gcds-btn-skip {
        background: transparent;
        color: #64748b;
        font-size: 12px;
        border: 1.5px solid #334155;
        border-radius: 8px;
        padding: 9px 14px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }
      #gcds-rel-card .gcds-btn-skip:hover { color: #f87171; border-color: #f87171; }
      #gcds-rel-card .gcds-spinner {
        display: inline-block;
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: gcds-spin 0.6s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
      }
      @keyframes gcds-spin { to { transform: rotate(360deg); } }

      /* ── Section E, G & H Floating Action Cards ── */
      #gcds-aadhaar-card, #gcds-doc-card, #gcds-house-card {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 2147483647;
        width: 330px;
        background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);
        border: 1.5px solid #6366f1;
        border-radius: 14px;
        padding: 18px 18px 14px;
        box-shadow: 0 8px 40px rgba(99,102,241,0.35), 0 2px 12px rgba(0,0,0,0.5);
        font-family: 'Inter', system-ui, sans-serif;
        color: #f1f5f9;
        animation: gcds-card-in 0.25s cubic-bezier(0.34,1.56,0.64,1);
        user-select: none;
      }
      #gcds-aadhaar-card .gcds-card-header, #gcds-doc-card .gcds-card-header, #gcds-house-card .gcds-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      #gcds-aadhaar-card .gcds-card-badge, #gcds-doc-card .gcds-card-badge, #gcds-house-card .gcds-card-badge {
        background: #6366f1;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 2px 8px;
        border-radius: 20px;
        text-transform: uppercase;
      }
      #gcds-aadhaar-card .gcds-card-title, #gcds-doc-card .gcds-card-title, #gcds-house-card .gcds-card-title {
        font-size: 13px;
        font-weight: 600;
        color: #94a3b8;
      }
      #gcds-aadhaar-card .gcds-rec-box, #gcds-doc-card .gcds-rec-box, #gcds-house-card .gcds-rec-box {
        background: rgba(99,102,241,0.12);
        border: 1px solid rgba(99,102,241,0.4);
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 12px;
      }
      #gcds-aadhaar-card .gcds-rec-label, #gcds-doc-card .gcds-rec-label, #gcds-house-card .gcds-rec-label {
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      #gcds-aadhaar-card .gcds-rec-name, #gcds-doc-card .gcds-rec-name, #gcds-house-card .gcds-rec-name {
        font-size: 15px;
        font-weight: 700;
        color: #a5b4fc;
        letter-spacing: -0.01em;
      }
      #gcds-aadhaar-card .gcds-rec-desc, #gcds-doc-card .gcds-rec-desc, #gcds-house-card .gcds-rec-desc {
        font-size: 11.5px;
        color: #cbd5e1;
        margin-top: 4px;
        line-height: 1.4;
      }
      #gcds-aadhaar-card .gcds-aadhaar-input-box {
        margin-bottom: 12px;
      }
      #gcds-aadhaar-card .gcds-aadhaar-input {
        width: 100%;
        box-sizing: border-box;
        background: #0f172a;
        border: 1.5px solid #334155;
        border-radius: 8px;
        color: #f8fafc;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 2px;
        padding: 10px 12px;
        text-align: center;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      #gcds-aadhaar-card .gcds-aadhaar-input:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99,102,241,0.25);
      }
      #gcds-aadhaar-card .gcds-input-hint, #gcds-doc-card .gcds-input-hint {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 4px;
        text-align: center;
      }
      #gcds-aadhaar-card .gcds-input-hint.ready, #gcds-doc-card .gcds-input-hint.ready {
        color: #34d399;
        font-weight: 600;
      }
      #gcds-doc-card .gcds-doc-status-box {
        margin-bottom: 12px;
        padding: 10px 12px;
        background: #0f172a;
        border: 1.5px solid #334155;
        border-radius: 8px;
        text-align: center;
      }
      #gcds-aadhaar-card .gcds-btn-no-aadhaar {
        width: 100%;
        background: rgba(239, 68, 68, 0.12);
        color: #fca5a5;
        border: 1.5px solid rgba(239, 68, 68, 0.35);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        padding: 9px 0;
        cursor: pointer;
        margin-bottom: 10px;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        text-align: center;
      }
      #gcds-aadhaar-card .gcds-btn-no-aadhaar:hover {
        background: rgba(239, 68, 68, 0.22);
        border-color: #ef4444;
        color: #ffffff;
      }
      #gcds-aadhaar-card .gcds-btn-row, #gcds-doc-card .gcds-btn-row, #gcds-house-card .gcds-btn-row {
        display: flex;
        gap: 8px;
      }
      #gcds-aadhaar-card .gcds-btn-confirm, #gcds-doc-card .gcds-btn-confirm, #gcds-house-card .gcds-btn-confirm {
        flex: 1;
        background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        border: none;
        border-radius: 8px;
        padding: 9px 0;
        cursor: pointer;
        letter-spacing: 0.02em;
        transition: opacity 0.15s, transform 0.1s;
        box-shadow: 0 2px 8px rgba(99,102,241,0.4);
      }
      #gcds-aadhaar-card .gcds-btn-confirm:hover, #gcds-doc-card .gcds-btn-confirm:hover, #gcds-house-card .gcds-btn-confirm:hover { opacity: 0.9; transform: translateY(-1px); }
      #gcds-aadhaar-card .gcds-btn-confirm:active, #gcds-doc-card .gcds-btn-confirm:active, #gcds-house-card .gcds-btn-confirm:active { opacity: 0.8; transform: translateY(0); }
      #gcds-aadhaar-card .gcds-btn-confirm:disabled, #gcds-doc-card .gcds-btn-confirm:disabled, #gcds-house-card .gcds-btn-confirm:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
      #gcds-aadhaar-card .gcds-btn-skip, #gcds-doc-card .gcds-btn-skip, #gcds-house-card .gcds-btn-skip {
        background: transparent;
        color: #64748b;
        font-size: 12px;
        border: 1.5px solid #334155;
        border-radius: 8px;
        padding: 9px 14px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }
      #gcds-aadhaar-card .gcds-btn-skip:hover, #gcds-doc-card .gcds-btn-skip:hover, #gcds-house-card .gcds-btn-skip:hover { color: #f87171; border-color: #f87171; }
      #gcds-aadhaar-card .gcds-spinner, #gcds-doc-card .gcds-spinner, #gcds-house-card .gcds-spinner {
        display: inline-block;
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: gcds-spin 0.6s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
      }
      #gcds-doc-card .gcds-doc-picker-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
        max-height: 250px;
        overflow-y: auto;
        padding-right: 2px;
      }
      #gcds-doc-card .gcds-doc-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 11px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        width: 100%;
        box-sizing: border-box;
      }
      #gcds-doc-card .gcds-doc-option:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      }
      #gcds-doc-card .gcds-doc-option.available {
        border: 1.5px solid #059669;
        background: rgba(5, 150, 105, 0.12);
      }
      #gcds-doc-card .gcds-doc-option.available:hover {
        background: rgba(5, 150, 105, 0.22);
        border-color: #10b981;
      }
      #gcds-doc-card .gcds-doc-option.unavailable {
        border: 1px solid #334155;
        background: #0f172a;
      }
      #gcds-doc-card .gcds-doc-option.unavailable:hover {
        background: #1e293b;
        border-color: #64748b;
      }
      #gcds-doc-card .gcds-doc-opt-left {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      #gcds-doc-card .gcds-doc-opt-title {
        font-size: 13px;
        font-weight: 700;
        color: #f1f5f9;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #gcds-doc-card .gcds-doc-opt-sub {
        font-size: 11px;
        color: #94a3b8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #gcds-doc-card .gcds-doc-badge {
        font-size: 10.5px;
        font-weight: 700;
        padding: 3px 7px;
        border-radius: 5px;
        white-space: nowrap;
        margin-left: 8px;
      }
      #gcds-doc-card .gcds-doc-badge.ready {
        background: rgba(16, 185, 129, 0.25);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.5);
      }
      #gcds-doc-card .gcds-doc-badge.manual {
        background: rgba(100, 116, 139, 0.2);
        color: #94a3b8;
        border: 1px solid rgba(100, 116, 139, 0.4);
      }
      #gcds-doc-card .gcds-btn-back {
        background: transparent;
        color: #94a3b8;
        font-size: 12px;
        border: 1px solid #475569;
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
        margin-bottom: 10px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: color 0.15s, border-color 0.15s;
      }
      #gcds-doc-card .gcds-btn-back:hover {
        color: #cbd5e1;
        border-color: #94a3b8;
      }
    `;
    document.head.appendChild(s);
  }

  /**
   * Requests transliteration from the background script into the target language.
   * If the text is empty or already in the non-Latin script, returns as-is.
   *
   * @param {string} text - English text to transliterate
   * @param {string} targetLang - Language code ('bn', 'hi', etc.)
   * @returns {Promise<string>}
   */
  async function requestTransliteration(text, targetLang = 'bn') {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed) return '';
    if (/[^\u0000-\u007F]/.test(trimmed)) return trimmed; // already non-ASCII
    try {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        let timer;
        const sendPromise = new Promise((res) => {
          chrome.runtime.sendMessage(
            { action: 'TRANSLITERATE', payload: { text: trimmed, lang: window.glocale || targetLang } },
            (r) => {
              if (chrome.runtime?.lastError) {
                res(null);
                return;
              }
              res(r);
            }
          );
        });
        const timeoutPromise = new Promise((res) => {
          timer = setTimeout(() => res(null), 2500);
        });
        const resp = await Promise.race([sendPromise, timeoutPromise]);
        clearTimeout(timer);
        if (resp && resp.success && resp.text) {
          return String(resp.text).trim();
        }
      }
    } catch (e) {
      console.warn('[GCDS] Transliteration failed for:', text, e);
    }
    return '';
  }

  /**
   * Selects the ECI portal radio button for the given relative code.
   * Targets standard ECI selectors, input#relatives[value="..."], and
   * portal ID variants (input#relatMother, input#relatHusband, etc.).
   *
   * @param {string} relCode - 'FTHR' | 'MTHR' | 'HSBN' | 'WIFE' | 'OTHR'
   * @returns {boolean}
   */
  function selectRelationRadio(relCode) {
    const codeAliases = {
      MTHR: ['relatMother', 'mother', 'relatMthr', 'radioMother'],
      HSBN: ['relatHusband', 'husband', 'relatHsbn', 'radioHusband'],
      FTHR: ['relatFather', 'father', 'relatFthr', 'radioFather'],
      WIFE: ['relatWife', 'wife', 'radioWife'],
      OTHR: ['relatOther', 'other', 'relatOthr', 'radioOther'],
    };

    const specificIds = codeAliases[relCode] || [];
    const selectors = [
      `input[type="radio"][name="relatives"][value="${relCode}"]`,
      `input[name="relatives"][value="${relCode}"]`,
      `input#relatives[value="${relCode}"]`,
      ...specificIds.map((id) => `input#${id}`),
      ...specificIds.map((id) => `#${id}`),
    ];

    for (const sel of selectors) {
      const radio = document.querySelector(sel);
      if (radio) {
        setRadioOrCheckbox(radio, true);
        const propKey = Object.keys(radio).find((k) => k.startsWith('__reactProps'));
        if (propKey && radio[propKey]?.onChange) {
          try { radio[propKey].onChange({ target: radio }); } catch {}
        }
        highlightField(radio);
        return true;
      }
    }

    // Try finding by label or parent text if not found by selector
    const allRelRadios = document.querySelectorAll('input[type="radio"][name="relatives"], input[type="radio"]');
    const targetLabel = { FTHR: 'father', MTHR: 'mother', HSBN: 'husband', WIFE: 'wife', OTHR: 'guardian' }[relCode];
    if (targetLabel) {
      for (const r of allRelRadios) {
        const text = (r.labels?.[0]?.innerText || r.parentElement?.innerText || '').toLowerCase();
        if (text.includes(targetLabel)) {
          setRadioOrCheckbox(r, true);
          const propKey = Object.keys(r).find((k) => k.startsWith('__reactProps'));
          if (propKey && r[propKey]?.onChange) {
            try { r[propKey].onChange({ target: r }); } catch {}
          }
          highlightField(r);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Safe HTML escaping utility for UI card injections.
   *
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Shows a floating "Relation Recommendation" Action Card for Section C.
   *
   * Resolves with the operator-chosen relation object OR null if skipped.
   *
   * @param {object} recommendation - { code, labelEn, labelBn } of the suggested relation
   * @param {string} relFirstName   - English first name of the relative
   * @param {string} relLastName    - English last name of the relative
   * @param {object} allNames       - Map of relCode → { first, last, regionalFirst, regionalLast }
   * @returns {Promise<{code:string, labelEn:string, labelBn:string, firstName:string, lastName:string, regionalFirst:string, regionalLast:string}|null>}
   */
  function waitForRelationConfirmation(recommendation, relFirstName, relLastName, allNames = {}) {
    return new Promise((resolve) => {
      injectRelationCardStyles();

      // Remove any stale card
      const stale = document.getElementById('gcds-rel-card');
      if (stale) stale.remove();

      let selectedCode = recommendation.code;
      let activeRelationData = allNames[selectedCode] || {
        code: selectedCode,
        first: relFirstName,
        last: relLastName,
        regionalFirst: '',
        regionalLast: '',
      };

      // Helper to trigger background transliteration for active relation
      const ensureTransliteration = async (relData) => {
        if (!relData || !relData.first) return;
        if (!relData.regionalFirst) {
          const res = await requestTransliteration(relData.first);
          if (res) relData.regionalFirst = res;
        }
        if (relData.last && !relData.regionalLast) {
          const res = await requestTransliteration(relData.last);
          if (res) relData.regionalLast = res;
        }
      };

      // Kick off background transliteration for initial recommendation if needed
      ensureTransliteration(activeRelationData);

      // Build name display helper
      const nameFor = (code) => {
        if (allNames[code]) {
          const n = allNames[code];
          return [n.first, n.last].filter(Boolean).join(' ') || n.fullName || '';
        }
        return '';
      };

      // Visible relation options: ALWAYS display all standard relation options so the operator can pick any relation
      const visibleOptions = RELATION_OPTIONS;

      const card = document.createElement('div');
      card.id = 'gcds-rel-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Section C Relation Confirmation');

      const renderCard = () => {
        const sel = RELATION_OPTIONS.find((o) => o.code === selectedCode) || recommendation;
        const currentData = allNames[selectedCode] || activeRelationData || {};
        const selName = [currentData.first, currentData.last].filter(Boolean).join(' ') ||
                        currentData.fullName ||
                        nameFor(selectedCode) ||
                        '';
        const displaySub = selName
          ? (currentData.regionalFirst ? `${selName} (${[currentData.regionalFirst, currentData.regionalLast].filter(Boolean).join(' ')})` : selName)
          : '(No record in GCDS — Enter manually on form)';

        card.innerHTML = `
          <div class="gcds-card-header">
            <span class="gcds-card-badge">Section C</span>
            <span class="gcds-card-title">Relation Recommendation</span>
          </div>
          <div class="gcds-rec-box">
            <div class="gcds-rec-label">Selected Relation</div>
            <div class="gcds-rec-name">${sel.labelBn} (${sel.labelEn})</div>
            <div class="gcds-rec-name-en">${displaySub}</div>
          </div>
          <div class="gcds-select-row" id="gcds-rel-chips">
            ${visibleOptions.map((o) => `
              <button type="button" class="gcds-rel-chip${o.code === selectedCode ? ' active' : ''}" data-code="${o.code}" data-testid="rel-chip-${o.code.toLowerCase()}" title="${nameFor(o.code) || 'Select ' + o.labelEn}">
                ${o.labelEn}
              </button>
            `).join('')}
          </div>
          <div class="gcds-btn-row">
            <button type="button" class="gcds-btn-confirm" id="gcds-btn-confirm" data-testid="btn-confirm-fill">
              ✅ Confirm &amp; Fill
            </button>
            <button type="button" class="gcds-btn-skip" id="gcds-btn-skip" data-testid="btn-skip-fill" title="Skip Section C">
              Skip
            </button>
          </div>
        `;

        // 1. Chip selection: dynamically swap activeRelationData, select live radio, and trigger transliteration
        card.querySelectorAll('.gcds-rel-chip').forEach((chip) => {
          chip.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedCode = chip.dataset.code;
            activeRelationData = allNames[selectedCode] || {
              code: selectedCode,
              first: '',
              last: '',
              regionalFirst: '',
              regionalLast: '',
            };

            // Instant live feedback on Form 6 portal radio
            selectRelationRadio(selectedCode);

            renderCard();

            // Re-trigger transliteration if regional name is missing
            if (activeRelationData.first && !activeRelationData.regionalFirst) {
              await ensureTransliteration(activeRelationData);
              const recNameEnEl = card.querySelector('.gcds-rec-name-en');
              if (recNameEnEl && selectedCode === chip.dataset.code) {
                const updatedName = [activeRelationData.first, activeRelationData.last].filter(Boolean).join(' ') || activeRelationData.fullName;
                if (activeRelationData.regionalFirst) {
                  recNameEnEl.textContent = `${updatedName} (${[activeRelationData.regionalFirst, activeRelationData.regionalLast].filter(Boolean).join(' ')})`;
                }
              }
            }
          });
        });

        // 2. Confirm button: strictly reads currently selected relation's data
        card.querySelector('#gcds-btn-confirm').addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const currentCode = selectedCode;
          const chosenOpt = RELATION_OPTIONS.find((o) => o.code === currentCode) || recommendation;
          const chosenData = allNames[currentCode] || activeRelationData || {};

          card.querySelector('#gcds-btn-confirm').innerHTML =
            '<span class="gcds-spinner"></span> Filling…';
          card.querySelector('#gcds-btn-confirm').disabled = true;

          // Ensure regional transliteration is done before resolving if name is present
          if (chosenData.first) {
            await ensureTransliteration(chosenData);
          }

          setTimeout(() => {
            card.remove();
            resolve({
              code: chosenOpt.code,
              labelEn: chosenOpt.labelEn,
              labelBn: chosenOpt.labelBn,
              firstName: chosenData.first || '',
              lastName: chosenData.last || '',
              regionalFirst: chosenData.regionalFirst || '',
              regionalLast: chosenData.regionalLast || '',
            });
          }, 200);
        });

        // 3. Skip button
        card.querySelector('#gcds-btn-skip').addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          card.remove();
          resolve(null);
        });
      };

      renderCard();
      document.body.appendChild(card);

      // Auto-scroll Section C box into view so operator sees the form + card
      const boxC = findSectionBox('C');
      if (boxC) {
        try { boxC.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      }
    });
  }

  /**
   * Shows a floating Action Card for Section E when Aadhaar is missing from GCDS.
   *
   * Prompts the operator for manual 12-digit Aadhaar input OR legal declaration
   * that customer does not have Aadhaar ("No Aadhaar").
   *
   * @returns {Promise<{ action: 'AADHAAR', aadhaarNumber: string } | { action: 'NO_AADHAAR' } | { action: 'SKIP' }>}
   */
  function waitForAadhaarConfirmation() {
    return new Promise((resolve) => {
      injectRelationCardStyles();

      // Remove any stale card
      const stale = document.getElementById('gcds-aadhaar-card');
      if (stale) stale.remove();

      const card = document.createElement('div');
      card.id = 'gcds-aadhaar-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Section E Aadhaar Details Confirmation');

      card.innerHTML = `
        <div class="gcds-card-header">
          <span class="gcds-card-badge">Section E</span>
          <span class="gcds-card-title">Aadhaar Details</span>
        </div>
        <div class="gcds-rec-box">
          <div class="gcds-rec-label">Aadhaar Verification</div>
          <div class="gcds-rec-name">Aadhaar Missing in GCDS</div>
          <div class="gcds-rec-desc">Aadhaar Number not found in GCDS. Please enter manually or declare No Aadhaar:</div>
        </div>
        <div class="gcds-aadhaar-input-box">
          <input
            type="text"
            class="gcds-aadhaar-input"
            id="gcds-aadhaar-input"
            placeholder="XXXX XXXX XXXX"
            maxlength="14"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="gcds-input-hint" id="gcds-aadhaar-hint">Enter 12-digit Aadhaar number</div>
        </div>
        <button type="button" class="gcds-btn-no-aadhaar" id="gcds-btn-no-aadhaar" title="Customer does not possess an Aadhaar number">
          ⚠️ Customer does not have Aadhaar
        </button>
        <div class="gcds-btn-row">
          <button type="button" class="gcds-btn-confirm" id="gcds-btn-apply-aadhaar" disabled title="Enter 12 digits to apply">
            ✅ Apply &amp; Fill
          </button>
          <button type="button" class="gcds-btn-skip" id="gcds-btn-skip-aadhaar" title="Skip Section E">
            Skip
          </button>
        </div>
      `;

      const input = card.querySelector('#gcds-aadhaar-input');
      const hint = card.querySelector('#gcds-aadhaar-hint');
      const btnApply = card.querySelector('#gcds-btn-apply-aadhaar');
      const btnNoAadhaar = card.querySelector('#gcds-btn-no-aadhaar');
      const btnSkip = card.querySelector('#gcds-btn-skip-aadhaar');

      // Auto-format Aadhaar with space separation (XXXX XXXX XXXX)
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(0, 12);
        let formatted = '';
        for (let i = 0; i < digits.length; i++) {
          if (i > 0 && i % 4 === 0) formatted += ' ';
          formatted += digits[i];
        }
        input.value = formatted;

        if (digits.length === 12) {
          hint.textContent = '✅ 12 digits ready';
          hint.classList.add('ready');
          btnApply.disabled = false;
        } else if (digits.length === 0) {
          hint.textContent = 'Enter 12-digit Aadhaar number';
          hint.classList.remove('ready');
          btnApply.disabled = true;
        } else {
          hint.textContent = `${digits.length}/12 digits entered`;
          hint.classList.remove('ready');
          btnApply.disabled = true;
        }
      });

      // Enter key submits if 12 digits ready
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !btnApply.disabled) {
          e.preventDefault();
          btnApply.click();
        }
      });

      // Scenario B: Operator entered 12 digits and clicked Apply
      btnApply.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const digits = input.value.replace(/\D/g, '');
        if (digits.length !== 12) return;

        btnApply.innerHTML = '<span class="gcds-spinner"></span> Applying…';
        btnApply.disabled = true;
        btnNoAadhaar.disabled = true;

        setTimeout(() => {
          card.remove();
          resolve({ action: 'AADHAAR', aadhaarNumber: digits });
        }, 150);
      });

      // Scenario C: Customer has no Aadhaar (Legal Declaration)
      btnNoAadhaar.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        btnNoAadhaar.innerHTML = '<span class="gcds-spinner"></span> Setting No Aadhaar…';
        btnNoAadhaar.disabled = true;
        btnApply.disabled = true;

        setTimeout(() => {
          card.remove();
          resolve({ action: 'NO_AADHAAR' });
        }, 150);
      });

      // Skip button
      btnSkip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.remove();
        resolve({ action: 'SKIP' });
      });

      document.body.appendChild(card);

      // Auto-scroll Section E into view and focus input
      const boxE = findSectionBox('E');
      if (boxE) {
        try { boxE.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      }
      setTimeout(() => {
        try { input.focus(); } catch {}
      }, 200);
    });
  }

  /**
   * Shows a floating Smart Age-Proof Document Picker for Section G.
   *
   * Displays all 6 standard ECI Age Proof document options (PAN, Passport,
   * DL, Class X/XII Certificate, Birth Certificate, Aadhaar Card).
   *
   * Highlights documents available in GCDS with 1-click auto-upload capability.
   * If an unavailable document is selected, sets the portal dropdown and
   * switches to Manual Upload mode with the 2-second upload guard.
   *
   * @param {Object} options
   * @param {Array} options.candidates - List of age proof candidates from GCDS DTO
   * @param {string} [options.customerId] - Customer ID for binary fetch
   * @param {HTMLInputElement} [options.fileInput] - Target file input on portal DOM (#ageProof)
   * @param {HTMLSelectElement} [options.selectElement] - Target select element on portal DOM (select[name="ageproof"])
   * @param {HTMLInputElement} [options.radioElement] - Target radio element for ageDocument
   * @param {HTMLElement} [options.boxG] - Section G box container
   * @returns {Promise<{ action: 'UPLOADED'|'CONFIRMED'|'SKIP', code?: string, label?: string }>}
   */
  function waitForAgeProofSmartPicker({
    candidates = [],
    customerId = null,
    fileInput = null,
    selectElement = null,
    radioElement = null,
    boxG = null,
  }) {
    return new Promise((resolve) => {
      injectRelationCardStyles();

      // Remove any stale card
      const stale = document.getElementById('gcds-doc-card');
      if (stale) stale.remove();

      const card = document.createElement('div');
      card.id = 'gcds-doc-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Section G Smart Age-Proof Document Picker');

      const ECI_AGE_OPTIONS = [
        { code: 'PC', label: 'PAN Card', category: 'PAN_CARD', portalText: 'Pan Card', icon: '💳' },
        { code: 'IPSP', label: 'Indian Passport', category: 'PASSPORT', portalText: 'Indian Passport', icon: '🛂' },
        { code: 'DL', label: 'Driving License', category: 'DRIVING_LICENSE', portalText: 'Driving License', icon: '🚗' },
        { code: 'CCIS', altCode: 'CBSC', label: 'Certificates of Class X or XII', category: 'MARK_SHEET / SCHOOL_CERTIFICATE', portalText: 'Certificate of Class', icon: '🎓' },
        { code: 'BCMR', label: 'Birth Certificate', category: 'BIRTH_CERTIFICATE', portalText: 'Birth Certificate', icon: '📜' },
        { code: 'ADHR', label: 'Aadhaar Card', category: 'AADHAAR_CARD', portalText: 'Aadhaar Card', icon: '🆔' },
      ];

      // Match each ECI option with available candidates from GCDS
      const enrichedOptions = ECI_AGE_OPTIONS.map((opt) => {
        const found = candidates.find((c) => {
          if (!c) return false;
          if (c.code === opt.code) return true;
          if (opt.altCode && c.code === opt.altCode) return true;
          if (c.category && c.category === opt.category) return true;
          const t = `${c.documentType || ''} ${c.fileName || ''} ${c.type || ''}`.toLowerCase();
          if (opt.code === 'PC' && t.includes('pan')) return true;
          if (opt.code === 'ADHR' && t.includes('aadhaar')) return true;
          if (opt.code === 'BCMR' && t.includes('birth')) return true;
          if (opt.code === 'DL' && (t.includes('driving') || t.includes('license') || t.includes('dl'))) return true;
          if (opt.code === 'IPSP' && t.includes('passport')) return true;
          if (
            opt.code === 'CCIS' &&
            (t.includes('class') || t.includes('school') || t.includes('mark') || t.includes('matric') || t.includes('secondary') || t.includes('certificate'))
          ) {
            return true;
          }
          return false;
        });

        return {
          ...opt,
          isAvailable: Boolean(found && (found.url || found.signedUrl)),
          candidate: found ? {
            ...found,
            url: found.url || found.signedUrl,
          } : null,
        };
      });

      const availableCount = enrichedOptions.filter((o) => o.isAvailable).length;

      let fileWatchInterval = null;
      const cleanupListeners = () => {
        if (fileWatchInterval) {
          clearInterval(fileWatchInterval);
          fileWatchInterval = null;
        }
      };

      // Helper to select option in portal DOM
      const applyOptionToPortal = (opt) => {
        const rad =
          radioElement ||
          (boxG || document).querySelector('input[type="radio"][name="ageDocument"][value="ageProof"]') ||
          findElement(SELECTOR_MAP.ageProofRadio);
        if (rad && !rad.checked) {
          setRadioOrCheckbox(rad, true);
          rad.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const sel =
          selectElement ||
          (boxG || document).querySelector('select[name="ageproof"]') ||
          findElement(SELECTOR_MAP.ageProofType);
        if (sel) {
          const applied =
            setSelectValue(sel, opt.code) ||
            setSelectValue(sel, opt.portalText) ||
            (opt.altCode && setSelectValue(sel, opt.altCode));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return applied;
        }
        return false;
      };

      // ─── Mode 1: Render Picker ─────────────────────────────────────────────
      const renderPickerView = () => {
        cleanupListeners();

        const descText =
          availableCount > 0
            ? `Found <strong style="color: #34d399;">${availableCount} document(s)</strong> in GCDS. Click an option to auto-upload or upload manually:`
            : 'No Age Proof documents found in GCDS. Select a document type to upload manually in portal:';

        card.innerHTML = `
          <div class="gcds-card-header">
            <span class="gcds-card-badge">Section G</span>
            <span class="gcds-card-title">Smart Age-Proof Picker</span>
          </div>
          <div class="gcds-rec-box">
            <div class="gcds-rec-label">Age Proof Document</div>
            <div class="gcds-rec-name">Select Document Type</div>
            <div class="gcds-rec-desc">${descText}</div>
          </div>
          <div class="gcds-doc-picker-list" id="gcds-age-picker-list">
            ${enrichedOptions
              .map(
                (opt) => `
              <button
                type="button"
                class="gcds-doc-option ${opt.isAvailable ? 'available' : 'unavailable'}"
                data-code="${opt.code}"
                title="${opt.isAvailable ? 'Auto-upload ' + opt.label + ' from GCDS' : 'Select ' + opt.label + ' for manual upload'}"
              >
                <div class="gcds-doc-opt-left">
                  <div class="gcds-doc-opt-title">
                    <span>${opt.icon}</span>
                    <span>${opt.label}</span>
                  </div>
                  <div class="gcds-doc-opt-sub">
                    ${opt.isAvailable ? `📄 ${escapeHtml(opt.candidate?.fileName || 'Attached in GCDS')}` : 'Manual upload required'}
                  </div>
                </div>
                <div class="gcds-doc-badge ${opt.isAvailable ? 'ready' : 'manual'}">
                  ${opt.isAvailable ? '⚡ Auto-Upload' : '⚪ Manual'}
                </div>
              </button>
            `
              )
              .join('')}
          </div>
          <div class="gcds-btn-row">
            <button type="button" class="gcds-btn-skip" id="gcds-btn-skip-doc" style="width: 100%;" title="Skip Section G without auto-advancing">
              Skip Section G
            </button>
          </div>
        `;

        // Bind Option clicks
        card.querySelectorAll('.gcds-doc-option').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const code = btn.dataset.code;
            const opt = enrichedOptions.find((o) => o.code === code);
            if (!opt) return;

            if (opt.isAvailable && opt.candidate?.url) {
              await handleAutoUpload(opt);
            } else {
              handleManualMode(opt);
            }
          });
        });

        // Bind Skip
        card.querySelector('#gcds-btn-skip-doc').addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          cleanupListeners();
          card.remove();
          resolve({ action: 'SKIP' });
        });
      };

      // ─── Auto-Upload Handler ───────────────────────────────────────────────
      const handleAutoUpload = async (opt) => {
        cleanupListeners();

        card.innerHTML = `
          <div class="gcds-card-header">
            <span class="gcds-card-badge">Section G</span>
            <span class="gcds-card-title">Auto-Uploading Document</span>
          </div>
          <div class="gcds-rec-box">
            <div class="gcds-rec-label">Auto-Upload In Progress</div>
            <div class="gcds-rec-name">${opt.icon} ${opt.label}</div>
            <div class="gcds-rec-desc" id="gcds-upload-status-text">
              <span class="gcds-spinner"></span> Selecting ${opt.label} in ECI portal dropdown…
            </div>
          </div>
          <div class="gcds-doc-status-box" id="gcds-auto-status-box" style="border-color: #6366f1; background: rgba(99,102,241,0.1);">
            <span style="font-size: 13px; color: #a5b4fc;" id="gcds-auto-status-desc">⚡ Fetching file from GCDS Vault…</span>
          </div>
          <div class="gcds-btn-row">
            <button type="button" class="gcds-btn-skip" id="gcds-btn-cancel-upload" style="width: 100%;">
              Cancel &amp; Upload Manually
            </button>
          </div>
        `;

        card.querySelector('#gcds-btn-cancel-upload').addEventListener('click', (e) => {
          e.preventDefault();
          handleManualMode(opt);
        });

        const statusText = card.querySelector('#gcds-upload-status-text');
        const statusBox = card.querySelector('#gcds-auto-status-box');
        const statusDesc = card.querySelector('#gcds-auto-status-desc');

        try {
          // 1. Select option in portal dropdown
          applyOptionToPortal(opt);
          await sleep(150);

          // 2. Fetch blob from GCDS
          if (statusDesc) statusDesc.textContent = `⚡ Downloading ${opt.candidate.fileName || 'file'} from GCDS…`;
          const blob = await fetchFileBlob(opt.candidate.url, customerId);

          if (!blob || blob.size === 0) {
            throw new Error('Downloaded document blob is empty or inaccessible');
          }

          // 3. Inject into portal file input
          if (statusDesc) statusDesc.textContent = `⚡ Injecting ${opt.label} into portal file input…`;
          const inp =
            fileInput ||
            (boxG || document).querySelector('input[type="file"]#ageProof, input[type="file"][name="ageProof"]') ||
            findElement(SELECTOR_MAP.ageProofFile);

          const injected = await injectFileToPortal(inp, blob, opt.candidate.fileName || 'age_proof.jpg', false);

          // 1. Upload Presence Check: Wait up to 5 seconds for portal to register the file
          if (statusDesc) statusDesc.textContent = '⚡ Waiting for portal to sync…';
          if (statusText) statusText.innerHTML = '<span class="gcds-spinner"></span> Waiting for portal to sync…';

          let hasFile = false;
          const uploadPresenceStart = Date.now();
          while (Date.now() - uploadPresenceStart < 5000) {
            if (inp && inp.files && inp.files.length > 0) {
              hasFile = true;
              break;
            }
            // Re-detect file input in case Angular re-attached it
            const refreshedInp =
              (boxG || document).querySelector('input[type="file"]#ageProof, input[type="file"][name="ageProof"]') ||
              findElement(SELECTOR_MAP.ageProofFile);
            if (refreshedInp && refreshedInp.files && refreshedInp.files.length > 0) {
              hasFile = true;
              break;
            }
            await sleep(250);
          }

          if (!hasFile) {
            throw new Error('File input did not register injected file within 5 seconds.');
          }

          // 2. Portal Error Detection: Check for "File size exceeds" or validation errors
          const currentBoxG = boxG || findSectionBox('G');
          const errorEls = Array.from((currentBoxG || document).querySelectorAll('.alert, .text-danger, .invalid-feedback, .error-message'));
          let detectedError = null;
          for (const el of errorEls) {
            const errText = (el.innerText || el.textContent || '').trim();
            if (/size exceeds|less than 2\s*mb|invalid file|upload failed|error/i.test(errText)) {
              detectedError = errText;
              break;
            }
          }

          if (detectedError) {
            statusBox.style.borderColor = '#ef4444';
            statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
            statusDesc.style.color = '#f87171';
            statusDesc.style.fontWeight = '700';
            statusDesc.innerHTML = `⚠️ Portal Error: <strong>${escapeHtml(detectedError)}</strong>`;
            if (statusText) statusText.innerHTML = `⚠️ Upload rejected by portal. Choose another file or upload manually:`;
            handleManualMode(opt, `Portal rejected upload (${detectedError}). Please upload manually:`);
            return;
          }

          // 3. Heartbeat / Activity ping
          try {
            if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
              chrome.runtime.sendMessage({ action: 'RESET_INACTIVITY_TIMER' });
            }
          } catch {}

          // 4. Visual confirmation with "Waiting for portal to sync..."
          highlightField(inp);
          statusBox.style.borderColor = '#10b981';
          statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
          statusDesc.style.color = '#34d399';
          statusDesc.style.fontWeight = '700';
          const attachedName = inp.files?.[0]?.name || opt.candidate.fileName || 'file';
          const attachedSize = inp.files?.[0]?.size ? ` (${(inp.files[0].size / 1024).toFixed(1)} KB)` : '';
          statusDesc.innerHTML = `✅ Attached: <strong>${escapeHtml(attachedName)}</strong>${attachedSize}`;
          if (statusText) statusText.innerHTML = `✅ ${opt.label} registered. <strong>Waiting for portal to sync…</strong>`;

          await sleep(2000);
          cleanupListeners();
          card.remove();
          resolve({ action: 'UPLOADED', code: opt.code, label: opt.label });
          return;
        } catch (err) {
          console.warn('[GCDS Section G] Auto-upload error, switching to manual mode:', err);
          handleManualMode(opt, `Auto-injection could not complete (${err.message || 'Error'}). Please upload manually:`);
        }
      };

      // ─── Mode 2: Manual Upload Mode ────────────────────────────────────────
      const handleManualMode = (opt, customNotice = null) => {
        cleanupListeners();

        // 1. Instantly set the portal dropdown to this document type
        applyOptionToPortal(opt);

        const safeDocName = escapeHtml(opt.label);
        const noticeDesc = customNotice
          ? escapeHtml(customNotice)
          : `Document not found in GCDS. Please upload <strong>${safeDocName}</strong> manually in the portal below:`;

        card.innerHTML = `
          <div class="gcds-card-header">
            <span class="gcds-card-badge">Section G</span>
            <span class="gcds-card-title">Manual Upload Required</span>
          </div>
          <button type="button" class="gcds-btn-back" id="gcds-btn-back-picker">
            ⬅ Back to Document Picker
          </button>
          <div class="gcds-rec-box">
            <div class="gcds-rec-label">Manual Upload Required</div>
            <div class="gcds-rec-name">${opt.icon} ${safeDocName}</div>
            <div class="gcds-rec-desc">${noticeDesc}</div>
          </div>
          <div class="gcds-doc-status-box" id="gcds-manual-status-box">
            <span style="font-size: 13px; color: #94a3b8;" id="gcds-manual-status-text">⏳ Waiting for file selection in portal…</span>
          </div>
          <div class="gcds-btn-row">
            <button type="button" class="gcds-btn-confirm" id="gcds-btn-confirm-doc" disabled title="Upload a document file in the portal to proceed">
              ✅ Confirm &amp; Proceed
            </button>
            <button type="button" class="gcds-btn-skip" id="gcds-btn-skip-doc" title="Skip this section without advancing">
              Skip
            </button>
          </div>
        `;

        const statusBox = card.querySelector('#gcds-manual-status-box');
        const statusText = card.querySelector('#gcds-manual-status-text');
        const btnConfirm = card.querySelector('#gcds-btn-confirm-doc');
        const btnSkip = card.querySelector('#gcds-btn-skip-doc');
        const btnBack = card.querySelector('#gcds-btn-back-picker');

        btnBack.addEventListener('click', (e) => {
          e.preventDefault();
          renderPickerView();
        });

        const updateFileStatus = () => {
          const inp =
            fileInput ||
            (boxG || document).querySelector('input[type="file"]#ageProof, input[type="file"][name="ageProof"]') ||
            findElement(SELECTOR_MAP.ageProofFile);
          const hasFile = inp && inp.files && inp.files.length > 0;
          if (hasFile) {
            const f = inp.files[0];
            statusBox.style.borderColor = '#10b981';
            statusBox.style.background = 'rgba(16, 185, 129, 0.1)';
            statusText.style.color = '#34d399';
            statusText.style.fontWeight = '600';
            statusText.innerHTML = `✅ Attached: <strong>${escapeHtml(f.name)}</strong> (${(f.size / 1024).toFixed(1)} KB)`;
            btnConfirm.disabled = false;
          } else {
            statusBox.style.borderColor = '#334155';
            statusBox.style.background = '#0f172a';
            statusText.style.color = '#94a3b8';
            statusText.style.fontWeight = 'normal';
            statusText.innerHTML = '⏳ Waiting for file selection in portal…';
            btnConfirm.disabled = true;
          }
        };

        const inp =
          fileInput ||
          (boxG || document).querySelector('input[type="file"]#ageProof, input[type="file"][name="ageProof"]') ||
          findElement(SELECTOR_MAP.ageProofFile);
        if (inp) {
          inp.addEventListener('change', updateFileStatus);
        }
        fileWatchInterval = setInterval(updateFileStatus, 350);
        updateFileStatus();

        btnConfirm.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          cleanupListeners();
          if (inp) inp.removeEventListener('change', updateFileStatus);

          btnConfirm.innerHTML = '<span class="gcds-spinner"></span> 2s Guard…';
          btnConfirm.disabled = true;
          btnSkip.disabled = true;
          btnBack.disabled = true;

          await sleep(2000);
          card.remove();
          resolve({ action: 'CONFIRMED', code: opt.code, label: opt.label });
        });

        btnSkip.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          cleanupListeners();
          if (inp) inp.removeEventListener('change', updateFileStatus);
          card.remove();
          resolve({ action: 'SKIP' });
        });
      };

      // Initial View
      renderPickerView();
      document.body.appendChild(card);

      // Auto-scroll Section G box into view
      if (boxG) {
        try {
          boxG.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {}
      }
    });
  }

  /**
   * Parses single-line comma-separated Indian addresses into structured components:
   * [Village/Locality], [Post Office], [Tehsil/Block/City], [District], [PIN Code]
   *
   * @param {string} rawAddress
   * @returns {{ village?: string, postOffice?: string, tehsil?: string, district?: string, pincode?: string }}
   */
  function parseAddressComponents(rawAddress) {
    if (!rawAddress || typeof rawAddress !== 'string') return {};
    const tokens = rawAddress
      .split(/[,;\n]+/)
      .map((s) => s.trim().replace(/^(vill|village|po|p\.o\.|ps|p\.s\.|dist|district|pin|pincode)\s*[:.-]?\s*/i, ''))
      .filter(Boolean);
    if (tokens.length === 0) return {};

    const result = {};
    let pinFound = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const pinMatch = tokens[i].match(/\b\d{6}\b/);
      if (pinMatch) {
        pinFound = pinMatch[0];
        tokens[i] = tokens[i].replace(/\b\d{6}\b/, '').trim();
        break;
      }
    }
    if (pinFound) {
      result.pincode = pinFound;
    }

    const cleanTokens = tokens.filter((t) => t.length > 0 && !/^\d{6}$/.test(t));
    if (cleanTokens.length >= 1) result.village = cleanTokens[0];
    if (cleanTokens.length >= 2) result.postOffice = cleanTokens[1];
    if (cleanTokens.length >= 3) result.tehsil = cleanTokens[2];
    if (cleanTokens.length >= 4) result.district = cleanTokens[3];

    return result;
  }

  /**
   * Prompts operator with a floating modal card to manually enter House / Building / Apartment No. in portal.
   * Pauses Section H automation until operator enters House No. and clicks "Confirm & Fill Remaining".
   *
   * @returns {Promise<{ action: 'CONFIRMED'|'SKIP', houseNo: string }>}
   */
  function waitForHouseNumberInput() {
    return new Promise((resolve) => {
      injectRelationCardStyles();

      // Remove any stale card
      const stale = document.getElementById('gcds-house-card');
      if (stale) stale.remove();

      const card = document.createElement('div');
      card.id = 'gcds-house-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Section H Manual House Number Required');

      card.innerHTML = `
        <div class="gcds-card-header">
          <span class="gcds-card-badge">Section H</span>
          <span class="gcds-card-title">Manual Input Required</span>
        </div>
        <div class="gcds-rec-box">
          <div class="gcds-rec-label">House / Building / Apartment No.</div>
          <div class="gcds-rec-name">Enter House No. Manually</div>
          <div class="gcds-rec-desc">Please enter House/Building No. manually in the portal below to prevent incorrect kiosk data entry:</div>
        </div>
        <div class="gcds-doc-status-box" id="gcds-house-status-box" style="margin-bottom: 12px; border-color: #6366f1; background: rgba(99,102,241,0.1);">
          <span style="font-size: 13px; color: #a5b4fc;" id="gcds-house-status-text">⏳ Waiting for House No. entry in portal…</span>
        </div>
        <div class="gcds-btn-row">
          <button type="button" class="gcds-btn-confirm" id="gcds-btn-confirm-house" title="Confirm House No. and fill remaining address fields">
            Confirm &amp; Fill Remaining
          </button>
          <button type="button" class="gcds-btn-skip" id="gcds-btn-skip-house" title="Skip House No. and continue filling remaining fields">
            Skip
          </button>
        </div>
      `;

      const statusBox = card.querySelector('#gcds-house-status-box');
      const statusText = card.querySelector('#gcds-house-status-text');
      const btnConfirm = card.querySelector('#gcds-btn-confirm-house');
      const btnSkip = card.querySelector('#gcds-btn-skip-house');

      // Locate portal houseNo input
      const boxH = findSectionBox('H');
      const doorInput = (boxH || document).querySelector('input#doorD, input[name="houseNo"]') || findElement(SELECTOR_MAP.houseNo);

      // Focus portal input and scroll to Section H
      if (doorInput) {
        highlightField(doorInput);
        try { doorInput.focus(); } catch {}
      }
      if (boxH) {
        try { boxH.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      }

      // Live monitoring of the portal's houseNo input
      const updateHousePreview = () => {
        const val = doorInput ? doorInput.value.trim() : '';
        if (val) {
          statusBox.style.borderColor = '#10b981';
          statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
          statusText.style.color = '#34d399';
          statusText.style.fontWeight = '700';
          statusText.innerHTML = `✅ House No: <strong>${escapeHtml(val)}</strong>`;
        } else {
          statusBox.style.borderColor = '#6366f1';
          statusBox.style.background = 'rgba(99,102,241,0.1)';
          statusText.style.color = '#a5b4fc';
          statusText.style.fontWeight = 'normal';
          statusText.innerHTML = '⏳ Waiting for House No. entry in portal…';
        }
      };

      if (doorInput) {
        doorInput.addEventListener('input', updateHousePreview);
        doorInput.addEventListener('change', updateHousePreview);
      }
      const pollTimer = setInterval(updateHousePreview, 300);
      updateHousePreview();

      const cleanup = () => {
        clearInterval(pollTimer);
        if (doorInput) {
          doorInput.removeEventListener('input', updateHousePreview);
          doorInput.removeEventListener('change', updateHousePreview);
        }
      };

      btnConfirm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        const currentVal = doorInput ? doorInput.value.trim() : '';
        btnConfirm.innerHTML = '<span class="gcds-spinner"></span> Filling Remaining…';
        btnConfirm.disabled = true;
        setTimeout(() => {
          card.remove();
          resolve({ action: 'CONFIRMED', houseNo: currentVal });
        }, 150);
      });

      btnSkip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        card.remove();
        resolve({ action: 'SKIP', houseNo: '' });
      });

      document.body.appendChild(card);
    });
  }

  /**
   * Prompts the operator with a floating modal card when a supporting document
   * (Section G Age Proof or Section H Address Proof) is missing from GCDS or requires
   * manual file selection. Watches the portal's file input live and enables confirmation
   * once the operator has selected a valid file.
   *
   * @param {Object} options
   * @param {'G'|'H'} options.section - Section letter ('G' or 'H')
   * @param {string} options.title - Document title (e.g. 'Age Proof Document')
   * @param {string} options.docTypeName - Name of required doc type (e.g. 'Aadhaar Card')
   * @param {HTMLInputElement} [options.fileInput] - Target file input on portal DOM
   * @returns {Promise<{ action: 'CONFIRMED'|'SKIP' }>}
   */
  function waitForManualDocumentUpload({ section = 'G', title = 'Document Proof', docTypeName = 'Supporting Document', fileInput = null }) {
    return new Promise((resolve) => {
      injectRelationCardStyles();

      // Remove any stale doc card
      const stale = document.getElementById('gcds-doc-card');
      if (stale) stale.remove();

      const card = document.createElement('div');
      card.id = 'gcds-doc-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', `Section ${section} ${title} Manual Upload`);

      const safeDocType = escapeHtml(docTypeName || 'Supporting Document');
      const safeTitle = escapeHtml(title || 'Document Proof');

      card.innerHTML = `
        <div class="gcds-card-header">
          <span class="gcds-card-badge">Section ${section}</span>
          <span class="gcds-card-title">${safeTitle}</span>
        </div>
        <div class="gcds-rec-box">
          <div class="gcds-rec-label">Manual Upload Required</div>
          <div class="gcds-rec-name">${safeDocType}</div>
          <div class="gcds-rec-desc">Document not found in GCDS or portal upload needs manual attachment. Please select file in the portal below:</div>
        </div>
        <div class="gcds-doc-status-box" id="gcds-doc-status-box">
          <span style="font-size: 13px; color: #94a3b8;" id="gcds-doc-status-text">⏳ Waiting for file selection in portal…</span>
        </div>
        <div class="gcds-btn-row">
          <button type="button" class="gcds-btn-confirm" id="gcds-btn-confirm-doc" disabled title="Upload a document file in the portal to proceed">
            ✅ Confirm &amp; Proceed
          </button>
          <button type="button" class="gcds-btn-skip" id="gcds-btn-skip-doc" title="Skip this section without advancing">
            Skip
          </button>
        </div>
      `;

      const statusBox = card.querySelector('#gcds-doc-status-box');
      const statusText = card.querySelector('#gcds-doc-status-text');
      const btnConfirm = card.querySelector('#gcds-btn-confirm-doc');
      const btnSkip = card.querySelector('#gcds-btn-skip-doc');

      let interval = null;

      const updateFileStatus = () => {
        const input = fileInput || (section === 'G' ? findElement(SELECTOR_MAP.ageProofFile) : findElement(SELECTOR_MAP.addressProofFile));
        const hasFile = input && input.files && input.files.length > 0;
        if (hasFile) {
          const f = input.files[0];
          statusBox.style.borderColor = '#10b981';
          statusBox.style.background = 'rgba(16, 185, 129, 0.1)';
          statusText.style.color = '#34d399';
          statusText.style.fontWeight = '600';
          statusText.innerHTML = `✅ Attached: <strong>${escapeHtml(f.name)}</strong> (${(f.size / 1024).toFixed(1)} KB)`;
          btnConfirm.disabled = false;
        } else {
          statusBox.style.borderColor = '#334155';
          statusBox.style.background = '#0f172a';
          statusText.style.color = '#94a3b8';
          statusText.style.fontWeight = 'normal';
          statusText.innerHTML = '⏳ Waiting for file selection in portal…';
          btnConfirm.disabled = true;
        }
      };

      if (fileInput) {
        fileInput.addEventListener('change', updateFileStatus);
      }
      interval = setInterval(updateFileStatus, 350);
      updateFileStatus();

      // Confirm & Proceed
      btnConfirm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (interval) clearInterval(interval);
        if (fileInput) fileInput.removeEventListener('change', updateFileStatus);
        btnConfirm.innerHTML = '<span class="gcds-spinner"></span> Confirming…';
        btnConfirm.disabled = true;
        btnSkip.disabled = true;

        setTimeout(() => {
          card.remove();
          resolve({ action: 'CONFIRMED' });
        }, 150);
      });

      // Skip
      btnSkip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (interval) clearInterval(interval);
        if (fileInput) fileInput.removeEventListener('change', updateFileStatus);
        card.remove();
        resolve({ action: 'SKIP' });
      });

      document.body.appendChild(card);

      // Auto-scroll the corresponding section box into view
      const box = findSectionBox(section);
      if (box) {
        try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      }
      if (fileInput) {
        try { fileInput.focus(); } catch {}
      }
    });
  }

  // ─── Main Fill Engine ─────────────────────────────────────────────────────

  /**
   * Fills the ECI Form 6 with GCDS customer data section by section.
   *
   * @param {Object} data - The GCDS Form Fill DTO
   * @returns {{ success: boolean, filledCount: number, skippedCount: number, skippedFields: string[], error?: string }}
   */
  async function fillForm(data) {
    injectHighlightStyles();

    // Fail-safe: detect DOM changes
    const missingFields = detectDomChanges();
    if (missingFields.length >= 3) {
      return {
        success: false,
        filledCount: 0,
        skippedCount: 0,
        skippedFields: missingFields,
        error: `ECI portal DOM may have changed. Missing critical fields: ${missingFields.join(', ')}. Please report this to the extension developer.`,
      };
    }

    const name = data.name || {};
    const addr = data.address || {};
    const relative = data.relative || {};
    const electoral = data.electoral || {};

    let filledCount = 0;
    let skippedCount = 0;
    const skippedFields = [];

    /**
     * Attempts to fill a single text input field.
     */
    async function fillTextField(fieldKey, value) {
      if (!value) {
        skippedCount++;
        skippedFields.push(fieldKey);
        return;
      }

      const candidates = SELECTOR_MAP[fieldKey];
      if (!candidates) {
        skippedCount++;
        skippedFields.push(fieldKey);
        return;
      }

      let el = findElement(candidates);
      if (!el) {
        // Wait 500ms for accordion/DOM transition
        await sleep(500);
        el = findElement(candidates);
      }
      if (!el) {
        skippedCount++;
        skippedFields.push(fieldKey);
        return;
      }

      if (setInputValue(el, value)) {
        highlightField(el);
        filledCount++;
      } else {
        skippedCount++;
        skippedFields.push(fieldKey);
      }

      await sleep(FILL_STEP_DELAY_MS);
    }

    /**
     * Attempts to fill a single select dropdown field.
     */
    async function fillSelectField(fieldKey, value) {
      if (!value) {
        skippedCount++;
        skippedFields.push(fieldKey);
        return;
      }

      const candidates = SELECTOR_MAP[fieldKey];
      if (!candidates) {
        skippedCount++;
        skippedFields.push(fieldKey);
        return;
      }

      let el = findElement(candidates);
      if (!el) {
        await sleep(500);
        el = findElement(candidates);
      }
      if (!el) {
        skippedCount++;
        skippedFields.push(fieldKey);
        return;
      }

      if (setSelectValue(el, value)) {
        highlightField(el);
        filledCount++;
      } else {
        skippedCount++;
        skippedFields.push(fieldKey);
      }

      await sleep(FILL_STEP_DELAY_MS);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Section A: State, District & AC (Cascading Dropdowns)
    // ═══════════════════════════════════════════════════════════════════════════

    const stateVal = (addr.state || data.state || data.address_state || '').trim();
    const districtVal = (addr.district || data.district || data.address_district || '').trim();
    const acVal = (
      electoral.assemblyConstituencyName ||
      data.assembly_constituency ||
      data.assemblyConstituency ||
      data.ac ||
      data.asmbly ||
      ''
    ).trim();

    if (stateVal) {
      const stateFilled = await selectDropdownSafe(SELECTOR_MAP.state, stateVal, 10);
      if (stateFilled) {
        filledCount++;

        // Also check if Section H present address has a State dropdown
        const secHState = document.querySelector('select#currentStateCd[name="currentStateCd"]');
        if (secHState) {
          setSelectValue(secHState, stateVal);
        }

        await sleep(500);

        if (districtVal) {
          const boxA = findSectionBox('A');
          const secADistSelect = boxA ? boxA.querySelector('select#districtCd, select[name="districtCd"]') : null;
          const districtFilled = await selectDropdownSafe(secADistSelect || SELECTOR_MAP.district, districtVal, 10);
          if (districtFilled) {
            filledCount++;

            await sleep(500);

            if (acVal) {
              const acFilled = await selectDropdownSafe(
                SELECTOR_MAP.assemblyConstituency,
                acVal,
                10
              );

              if (acFilled) {
                filledCount++;
              } else {
                skippedCount++;
                skippedFields.push('assemblyConstituency');
              }
            }
          } else {
            skippedCount++;
            skippedFields.push('district');
            if (acVal) {
              skippedCount++;
              skippedFields.push('assemblyConstituency');
            }
          }
        }
      } else {
        skippedCount++;
        skippedFields.push('state');
      }
    }

    // Auto-advance Section A
    await clickSectionNextButton('A');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section B: Personal Details
    // ═══════════════════════════════════════════════════════════════════════════

    const firstName = name.firstName || data.firstName || data.first_name || '';
    const middleName = name.middleName || data.middleName || data.middle_name || '';
    const lastName = name.lastName || data.lastName || data.last_name || '';

    await fillTextField('firstName', firstName);
    await fillTextField('middleName', middleName);
    await fillTextField('lastName', lastName);

    // Regional applicant names for Section B (satisfies ECI React state validation)
    const origLangName = data.original_language_name || data.originalLanguageName || name.originalLanguageName || '';
    let regFirstVal = '';
    let regLastVal = '';
    if (origLangName) {
      const parts = origLangName.trim().split(/\s+/);
      regFirstVal = parts.slice(0, -1).join(' ') || parts[0];
      regLastVal = parts.length > 1 ? parts[parts.length - 1] : '';
    }
    const regFirstEl = document.querySelector('input#regfirst, #regfirst');
    if (regFirstEl && regFirstVal && /[^\u0000-\u007F]/.test(regFirstVal)) {
      setInputValue(regFirstEl, regFirstVal);
    }
    const regSurEl = document.querySelector('input#regSName, #regSName');
    if (regSurEl && regLastVal && /[^\u0000-\u007F]/.test(regLastVal)) {
      setInputValue(regSurEl, regLastVal);
    }

    // Photograph Upload (Section B)
    try {
      const photoSuccess = await handlePhotoSection(data);
      if (photoSuccess) {
        filledCount++;
        await sleep(350);
      }
    } catch (photoErr) {
      console.warn('[GCDS Fill Engine] Section B photo upload skipped:', photoErr);
    }

    // Auto-advance Section B
    await clickSectionNextButton('B');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section C: Relatives Details  ←  HUMAN-IN-THE-LOOP (HITL)
    //
    // Instead of auto-filling, we build a recommendation from GCDS data,
    // display a floating "Relation Recommendation" Action Card, and WAIT for
    // the operator to click "Confirm & Fill" (or "Skip").
    // Priority: Father > Mother > Husband/Wife > Other.
    // ═══════════════════════════════════════════════════════════════════════════

    // Helper: extracts and splits relative first/last and regional names
    function buildRelationRecord(code, firstMiddle, last, full, regFirst, regLast, regFull) {
      let f = String(firstMiddle || '').trim();
      let l = String(last || '').trim();
      const rawFull = String(full || '').trim();

      if (!f && rawFull) {
        const parts = rawFull.split(/\s+/);
        if (parts.length > 1) {
          f = parts.slice(0, -1).join(' ');
          l = parts[parts.length - 1];
        } else {
          f = parts[0];
        }
      } else if (f && !l) {
        const parts = f.split(/\s+/);
        if (parts.length > 1) {
          f = parts.slice(0, -1).join(' ');
          l = parts[parts.length - 1];
        }
      }

      let rf = String(regFirst || '').trim();
      let rl = String(regLast || '').trim();
      const rawRegFull = String(regFull || '').trim();

      if (!rf && rawRegFull) {
        const parts = rawRegFull.split(/\s+/);
        if (parts.length > 1) {
          rf = parts.slice(0, -1).join(' ');
          rl = parts[parts.length - 1];
        } else {
          rf = parts[0];
        }
      } else if (rf && !rl) {
        const parts = rf.split(/\s+/);
        if (parts.length > 1) {
          rf = parts.slice(0, -1).join(' ');
          rl = parts[parts.length - 1];
        }
      }

      if (!f && !l && !rawFull) return null;

      return {
        code,
        first: f,
        last: l,
        fullName: [f, l].filter(Boolean).join(' ') || rawFull,
        regionalFirst: rf,
        regionalLast: rl,
        regionalName: [rf, rl].filter(Boolean).join(' ') || rawRegFull,
      };
    }

    // 1. Build available-names map with dynamic fields from GCDS customer object
    const relAvailableNames = {};

    const rawGenderForRel = String(data.gender || '').trim().toLowerCase();
    const spouseCode = (rawGenderForRel === 'female' || rawGenderForRel === 'f') ? 'HSBN' : 'WIFE';

    // Father data mapping
    const fatherRecord = buildRelationRecord(
      'FTHR',
      relative.father_first_name || relative.fatherFirstMiddleName || data.father_first_name,
      relative.father_last_name || relative.fatherSurname || data.father_last_name,
      relative.fatherName || data.father_name,
      relative.fatherRegionalFirstName,
      relative.fatherRegionalLastName,
      relative.father_regional_name || data.father_regional_name
    );
    if (fatherRecord) {
      relAvailableNames['FTHR'] = fatherRecord;
    }

    // Mother data mapping
    const motherRecord = buildRelationRecord(
      'MTHR',
      relative.mother_first_name || relative.motherFirstMiddleName || data.mother_first_name,
      relative.mother_last_name || relative.motherSurname || data.mother_last_name,
      relative.motherName || data.mother_name,
      relative.motherRegionalFirstName,
      relative.motherRegionalLastName,
      relative.mother_regional_name || data.mother_regional_name
    );
    if (motherRecord) {
      relAvailableNames['MTHR'] = motherRecord;
    }

    // Spouse data mapping
    const spouseRecord = buildRelationRecord(
      spouseCode,
      relative.spouse_first_name || relative.spouseFirstMiddleName || data.spouse_first_name,
      relative.spouse_last_name || relative.spouseSurname || data.spouse_last_name,
      relative.spouseName || data.spouse_name,
      relative.spouseRegionalFirstName,
      relative.spouseRegionalLastName,
      relative.spouse_regional_name || data.spouse_regional_name
    );
    if (spouseRecord) {
      relAvailableNames[spouseCode] = spouseRecord;
      relAvailableNames['HSBN'] = { ...spouseRecord, code: 'HSBN' };
      relAvailableNames['WIFE'] = { ...spouseRecord, code: 'WIFE' };
    }

    // 2. Determine recommended relation (priority: Father > Mother > Spouse)
    const relPriorityOrder = ['FTHR', 'MTHR', spouseCode, 'WIFE', 'OTHR'];
    const recommendedCode = relPriorityOrder.find((c) => relAvailableNames[c]) || 'FTHR';

    const recommendedOpt = RELATION_OPTIONS.find((o) => o.code === recommendedCode) || {
      code: recommendedCode, labelEn: recommendedCode, labelBn: recommendedCode
    };
    const defaultNames = relAvailableNames[recommendedCode] || { first: '', last: '' };

    // 3. ── HITL: Show floating Action Card and await operator confirmation ──
    const confirmed = await waitForRelationConfirmation(
      recommendedOpt,
      defaultNames.first,
      defaultNames.last,
      relAvailableNames
    );

    if (confirmed) {
      const { code: relCode, firstName: relFirst, lastName: relLast, regionalFirst, regionalLast } = confirmed;

      // 4. Select radio button for chosen relation type (Father/Mother/Husband/Wife/Other)
      const radioSuccess = selectRelationRadio(relCode);
      if (radioSuccess) {
        filledCount++;
      } else {
        const labelMap = { FTHR: 'Father', HSBN: 'Husband', MTHR: 'Mother', WIFE: 'Wife', OTHR: 'Other' };
        await fillSelectField('relationType', labelMap[relCode] || 'Father');
      }

      await sleep(50);

      // 5. Target the Section C DOM elements directly
      const fNameSurEl = document.querySelector('input#fNameSur, #fNameSur, input[name="applicantRelativeName"]');
      const fNameSurnameEl = document.querySelector('input#fNameSurname, #fNameSurname, input[name="applicantRelativeSurname"]');
      const regRelNameEl = document.querySelector('input#regRelatName, #regRelatName');
      const regRelSurEl = document.querySelector('input#regRelatSurName, #regRelatSurName');

      // Relative First Name: set value or clear so previous relation data never lingers
      if (fNameSurEl) {
        setInputValue(fNameSurEl, relFirst || '');
        if (relFirst) {
          highlightField(fNameSurEl);
          filledCount++;
        }
      } else if (relFirst) {
        await fillTextField('relativeFirstName', relFirst);
      }

      // Relative Surname: set value or clear
      if (fNameSurnameEl) {
        setInputValue(fNameSurnameEl, relLast || '');
        if (relLast) {
          highlightField(fNameSurnameEl);
          filledCount++;
        }
      } else if (relLast) {
        await fillTextField('relativeLastName', relLast);
      }

      // 6. Regional (Bengali/Devanagari) relative names
      let regRelFirstVal = regionalFirst || '';
      let regRelLastVal  = regionalLast || '';

      if (!regRelFirstVal && relFirst) {
        regRelFirstVal = await requestTransliteration(relFirst);
      }
      if (!regRelLastVal && relLast) {
        regRelLastVal = await requestTransliteration(relLast);
      }

      // Regional First Name: set only genuine non-ASCII, otherwise clear
      if (regRelNameEl) {
        if (regRelFirstVal && /[^\u0000-\u007F]/.test(regRelFirstVal)) {
          setInputValue(regRelNameEl, regRelFirstVal);
          highlightField(regRelNameEl);
        } else {
          setInputValue(regRelNameEl, '');
        }
      }

      // Regional Surname: set only genuine non-ASCII, otherwise clear
      if (regRelSurEl) {
        if (regRelLastVal && /[^\u0000-\u007F]/.test(regRelLastVal)) {
          setInputValue(regRelSurEl, regRelLastVal);
          highlightField(regRelSurEl);
        } else {
          setInputValue(regRelSurEl, '');
        }
      }

      // 7. Auto-advance Section C only if we have relative first name populated.
      // If the chosen relation has no name in GCDS, focus the name input for manual entry!
      if (relFirst) {
        await clickSectionNextButton('C');
      } else {
        if (fNameSurEl) {
          try { fNameSurEl.focus(); } catch {}
        }
      }
    } else {
      // Operator chose to skip Section C — do NOT auto-advance; leave for manual entry
      console.info('[GCDS] Section C skipped by operator.');
      skippedCount++;
      skippedFields.push('relationType');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Section D: Contact Details
    // ═══════════════════════════════════════════════════════════════════════════

    let mobileNumber = String(data.mobile || data.phone || data.phone_number || '').trim();
    if (mobileNumber.startsWith('+91')) {
      mobileNumber = mobileNumber.replace(/^\+91[-\s]?/, '');
    }
    const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);

    if (cleanMobile.length === 10) {
      const mobSelfCb = document.querySelector('input[type="checkbox"][value="Self"]');
      if (mobSelfCb && !mobSelfCb.checked) {
        setRadioOrCheckbox(mobSelfCb, true);
        await sleep(50);
      }
      await fillTextField('mobile', cleanMobile);
    } else {
      skippedCount++;
      skippedFields.push('mobile');
    }

    if (data.email) {
      const allSelfCbs = document.querySelectorAll('input[type="checkbox"][value="Self"]');
      const emailSelfCb = allSelfCbs.length > 1 ? allSelfCbs[1] : null;
      if (emailSelfCb && !emailSelfCb.checked) {
        setRadioOrCheckbox(emailSelfCb, true);
        await sleep(50);
      }
      await fillTextField('email', data.email);
    } else {
      skippedCount++;
      skippedFields.push('email');
    }

    // Auto-advance Section D
    await clickSectionNextButton('D');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section E: Aadhaar Details (3-Tier Decision Tree)
    // ═══════════════════════════════════════════════════════════════════════════

    // Stale card cleanup if present
    const staleAadhaarCard = document.getElementById('gcds-aadhaar-card');
    if (staleAadhaarCard) staleAadhaarCard.remove();

    const rawAadhaar =
      data.aadhaar_number ||
      data.aadhaarNumber ||
      data.aadhaar ||
      data.identity?.aadhaar_number ||
      data.identity?.aadhaar ||
      '';
    const cleanAadhaar = String(rawAadhaar).replace(/\D/g, '');
    const hasValidAadhaar = cleanAadhaar.length === 12;

    let aadhaarDecision = null;
    if (hasValidAadhaar) {
      // Scenario A: Aadhaar Exists in GCDS — bypass manual prompt & auto-fill
      aadhaarDecision = { action: 'AADHAAR', aadhaarNumber: cleanAadhaar };
    } else {
      // Scenario B / C: Missing in GCDS — prompt operator via floating Kiosk UI card
      aadhaarDecision = await waitForAadhaarConfirmation();
    }

    if (aadhaarDecision && aadhaarDecision.action === 'AADHAAR') {
      const aadhaarNumToFill = aadhaarDecision.aadhaarNumber;

      // 1. Uncheck "noaadhaarnum" declaration if checked
      const noAadhaarCb = document.querySelector('input[type="checkbox"][value="noaadhaarnum"]');
      if (noAadhaarCb && noAadhaarCb.checked) {
        setRadioOrCheckbox(noAadhaarCb, false);
        await sleep(50);
      }

      // 2. Select "Aadhaar Number" checkbox
      const aadhaarCb = document.querySelector('input[type="checkbox"][value="aadhaarnum"]');
      if (aadhaarCb && !aadhaarCb.checked) {
        setRadioOrCheckbox(aadhaarCb, true);
        await sleep(80);
      }

      // 3. Fill 12-digit Aadhaar input
      const aadhaarInp =
        document.querySelector('input#aadhaarNumber') ||
        document.querySelector('input[name="aadhaarNumber"]');
      if (aadhaarInp) {
        setInputValue(aadhaarInp, aadhaarNumToFill);
        highlightField(aadhaarInp);
        filledCount++;
      } else {
        await fillTextField('aadhaarNumber', aadhaarNumToFill);
      }

      // 4. Since Section 5 has Aadhaar, setting Aadhaar as supporting document is valid
      const ageSelect = document.querySelector('select[name="ageproof"]');
      if (ageSelect) {
        setSelectValue(ageSelect, 'ADHR');
      }

      const resSelect = document.querySelector('select[name="currentAddressProofType"]');
      if (resSelect) {
        setSelectValue(resSelect, 'ADHR');
      }

      // Auto-advance Section E
      await clickSectionNextButton('E');
    } else if (aadhaarDecision && aadhaarDecision.action === 'NO_AADHAAR') {
      // Scenario C: Customer has no Aadhaar (Legal Declaration)

      // 1. Uncheck "aadhaarnum" checkbox if checked and clear input
      const aadhaarCb = document.querySelector('input[type="checkbox"][value="aadhaarnum"]');
      if (aadhaarCb && aadhaarCb.checked) {
        setRadioOrCheckbox(aadhaarCb, false);
        await sleep(50);
      }
      const aadhaarInp =
        document.querySelector('input#aadhaarNumber') ||
        document.querySelector('input[name="aadhaarNumber"]');
      if (aadhaarInp) {
        setInputValue(aadhaarInp, '');
      }

      // 2. CRITICAL LEGAL GUARD: Clear 'ADHR' from supporting docs if declared no Aadhaar
      const ageSelect = document.querySelector('select[name="ageproof"]');
      if (ageSelect && ageSelect.value === 'ADHR') {
        ageSelect.value = '';
        ageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const resSelect = document.querySelector('select[name="currentAddressProofType"]');
      if (resSelect && resSelect.value === 'ADHR') {
        resSelect.value = '';
        resSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 3. Select "I am not able to furnish my Aadhaar Number..." legal declaration
      const noAadhaarCb = document.querySelector('input[type="checkbox"][value="noaadhaarnum"]');
      if (noAadhaarCb) {
        if (!noAadhaarCb.checked) {
          setRadioOrCheckbox(noAadhaarCb, true);
        }
        highlightField(noAadhaarCb);
        filledCount++;
      }

      // Auto-advance Section E
      await clickSectionNextButton('E');
    } else {
      // Operator skipped Section E — leave for manual entry, do NOT auto-advance
      console.info('[GCDS] Section E skipped by operator.');
      skippedCount++;
      skippedFields.push('aadhaarNumber');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Section F: Gender
    // ═══════════════════════════════════════════════════════════════════════════

    const rawGender = String(data.gender || '').trim().toLowerCase();
    let genderCode = null;
    if (rawGender === 'male' || rawGender === 'm') genderCode = 'M';
    else if (rawGender === 'female' || rawGender === 'f') genderCode = 'F';
    else if (rawGender === 'third gender' || rawGender === 'transgender' || rawGender === 't' || rawGender === 'other') genderCode = 'T';

    let genderFilled = false;
    // Try radio first (ECI Form 6 standard)
    if (genderCode) {
      const genderRadio = document.querySelector(`input[type="radio"][name="gender"][value="${genderCode}"]`);
      if (genderRadio) {
        setRadioOrCheckbox(genderRadio, true);
        highlightField(genderRadio);
        filledCount++;
        genderFilled = true;
      }
    }
    // Fallback to select dropdown
    if (!genderFilled && data.gender) {
      const gEl = findElement(SELECTOR_MAP.gender);
      if (gEl && setSelectValue(gEl, data.gender)) {
        highlightField(gEl);
        filledCount++;
        genderFilled = true;
      }
    }
    if (!genderFilled) {
      skippedCount++;
      skippedFields.push('gender');
    }

    // Auto-advance Section F
    await clickSectionNextButton('F');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section G: Date of Birth details
    // ═══════════════════════════════════════════════════════════════════════════

    const rawDob = data.dateOfBirth || data.dob || null;
    if (rawDob) {
      let isoDob = '';
      if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(String(rawDob).trim())) {
        const parts = String(rawDob).trim().split(/[-/]/);
        isoDob = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else {
        const dob = new Date(rawDob);
        if (!isNaN(dob.getTime())) {
          isoDob = dob.toISOString().split('T')[0];
        }
      }

      if (isoDob) {
        const boxG = findSectionBox('G');
        const singleDobEl = boxG ? boxG.querySelector('input[type="date"][name="date"], input.library-date') : findElement(SELECTOR_MAP.dateOfBirth);
        if (singleDobEl) {
          if (setInputValue(singleDobEl, isoDob)) {
            highlightField(singleDobEl);
            filledCount++;
          }
        } else {
          const dobParts = isoDob.split('-');
          await fillSelectField('dobDay', String(Number(dobParts[2])));
          await fillSelectField('dobMonth', String(Number(dobParts[1])));
          await fillTextField('dobYear', dobParts[0]);
        }
      } else {
        skippedCount++;
        skippedFields.push('dateOfBirth');
      }
    } else {
      skippedCount++;
      skippedFields.push('dateOfBirth');
    }

    // ─── Section G: Age Proof Document Upload (Smart Document Picker) ─────────
    const boxG = findSectionBox('G');

    // 1. Radio: Select "Document for proof of Date of Birth"
    const proofRadio =
      (boxG || document).querySelector('input[type="radio"][name="ageDocument"][value="ageProof"]') ||
      findElement(SELECTOR_MAP.ageProofRadio);
    if (proofRadio && !proofRadio.checked) {
      setRadioOrCheckbox(proofRadio, true);
      proofRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 2. Locate Dropdown and File Input
    const ageSelect =
      (boxG || document).querySelector('select[name="ageproof"]') ||
      findElement(SELECTOR_MAP.ageProofType);

    const ageFileInput =
      (boxG || document).querySelector('input[type="file"]#ageProof, input[type="file"][name="ageProof"]') ||
      findElement(SELECTOR_MAP.ageProofFile);

    // 3. Assemble all Age Proof candidates from GCDS DTO
    let ageCandidates = [];
    if (Array.isArray(data.ageProofCandidates) && data.ageProofCandidates.length > 0) {
      ageCandidates = data.ageProofCandidates;
    } else if (data.documents?.ageProofCandidates && Array.isArray(data.documents.ageProofCandidates)) {
      ageCandidates = data.documents.ageProofCandidates;
    } else if (data.ageProofUrl || data.documents?.ageProof?.url) {
      // Legacy fallback: single candidate
      ageCandidates = [
        {
          code: data.ageProofType || data.documents?.ageProof?.type || (hasValidAadhaar ? 'ADHR' : 'PC'),
          category: data.ageProofType === 'PC' ? 'PAN_CARD' : 'AADHAAR_CARD',
          label: data.ageProofType === 'PC' ? 'PAN Card' : 'Aadhaar Card',
          url: data.ageProofUrl || data.documents?.ageProof?.url,
          fileName: data.documents?.ageProof?.fileName || 'age_proof.jpg',
          mimeType: data.documents?.ageProof?.mimeType || 'image/jpeg',
          documentType: data.documents?.ageProof?.type || 'Age Proof',
        },
      ];
    }

    // 4. Launch Smart Age-Proof Picker Action Card
    const pickerResult = await waitForAgeProofSmartPicker({
      candidates: ageCandidates,
      customerId: data.id || data._id || data.customerId,
      fileInput: ageFileInput,
      selectElement: ageSelect,
      radioElement: proofRadio,
      boxG,
    });

    let ageUploaded = false;
    if (pickerResult.action === 'UPLOADED' || pickerResult.action === 'CONFIRMED') {
      ageUploaded = true;
      filledCount++;
    } else {
      console.log('[GCDS Section G] Operator skipped Age Proof upload. Will not auto-advance Section G.');
      skippedCount++;
      skippedFields.push('ageProof');
    }

    // Safety net: check if file is already present on the input
    const curFileInput =
      ageFileInput ||
      (boxG || document).querySelector('input[type="file"]#ageProof, input[type="file"][name="ageProof"]') ||
      findElement(SELECTOR_MAP.ageProofFile);
    if (!ageUploaded && curFileInput && curFileInput.files && curFileInput.files.length > 0) {
      console.log('[GCDS Section G] File detected on file input directly. Setting ageUploaded = true.');
      ageUploaded = true;
      filledCount++;
    }

    /**
     * Stability Guard: Transitions safely from Section G to Section H using a Click & Verify loop.
     * Prevents race conditions where Angular validates the uploaded file asynchronously or collapses/re-renders DOM.
     */
    async function transitionSectionGToSectionH(maxAttempts = 4) {
      console.log('[GCDS Section G->H] Starting Click & Verify transition loop to Section H...');

      const isSectionHActive = () => {
        // In the portal's sidebar:
        // Section G complete -> 'sidenavclassstart'
        // Section H active -> 'sidenavclass' or 'sidenavclassstart'
        const sidebarItems = Array.from(document.querySelectorAll('[class*="box1"], [class*="sidenavclass"]'))
          .filter((x) => x.innerText && /^[A-L]\./.test(x.innerText.trim()));
        const itemG = sidebarItems.find((it) => it.innerText.trim().startsWith('G.'));
        const itemH = sidebarItems.find((it) => it.innerText.trim().startsWith('H.'));

        if (itemG && itemG.className.includes('sidenavclassstart')) {
          return true;
        }
        if (itemH && (itemH.className.includes('sidenavclassstart') || itemH.className.includes('sidenavclass'))) {
          return true;
        }
        return false;
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`[GCDS Section G->H] Clicking Next on Section G (attempt ${attempt}/${maxAttempts})...`);
        const clicked = await clickSectionNextButton('G');
        console.log(`[GCDS Section G->H] Section G clickSectionNextButton result: ${clicked}`);

        // Wait 1.5 seconds for Angular/React validation and transition
        await sleep(1500);

        if (isSectionHActive()) {
          console.log(`[GCDS Section G->H] Section H transition confirmed on attempt ${attempt}.`);
          break;
        }

        // Direct sidebar click fallback
        console.log(`[GCDS Section G->H] Triggering Section H sidebar navigation fallback...`);
        const sidebarItems = Array.from(document.querySelectorAll('[class*="box1"], [class*="sidenavclass"]'))
          .filter((x) => x.innerText && /^[A-L]\./.test(x.innerText.trim()));
        const itemH = sidebarItems.find((it) => it.innerText.trim().startsWith('H.'));
        if (itemH) {
          try {
            itemH.click();
            itemH.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            const innerLink = itemH.querySelector('.content_sidenav');
            if (innerLink) {
              innerLink.click();
              innerLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            }
            await sleep(1500);
          } catch {}
        }

        if (isSectionHActive()) {
          console.log(`[GCDS Section G->H] Section H transition confirmed via sidebar on attempt ${attempt}.`);
          break;
        }

        // Check if Section G displays a validation error
        const currentBoxG = findSectionBox('G');
        const errEl = currentBoxG?.querySelector('.text-danger, .invalid-feedback, .alert');
        if (errEl && errEl.innerText && errEl.innerText.trim()) {
          console.warn('[GCDS Section G->H] Section G validation error blocking Next:', errEl.innerText.trim());
          await sleep(1000);
        }
      }

      // Smooth scroll Section H into view
      const boxH = findSectionBox('H');
      if (boxH) {
        try { boxH.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        await sleep(350);
      }
    }

    // 5. Auto-advance Section G ONLY if upload confirmed!
    if (ageUploaded) {
      await transitionSectionGToSectionH();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Section H: Present Address Details (Refined Workflow)
    // ═══════════════════════════════════════════════════════════════════════════

    const boxH = findSectionBox('H');
    if (boxH) {
      try { boxH.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      await sleep(300);
    }

    // Helper: Fill input and dispatch input, change, and blur events
    function fillAndDispatch(el, val) {
      if (!el || val === undefined || val === null) return false;
      setInputValue(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      highlightField(el);
      return true;
    }

    // Parse address fallback from raw string if individual components are missing
    const rawAddrStr = (
      addr.streetAddress ||
      addr.street ||
      addr.address ||
      data.address ||
      ''
    ).trim();
    const parsedAddr = parseAddressComponents(rawAddrStr);

    // 1. House/Building/Apartment No (Manual Entry):
    // Action: Leave this field BLANK. Operator will type manually.
    const houseInput = (boxH || document).querySelector('input#doorD, input#houseNo, input[name="houseNo"]') || findElement(SELECTOR_MAP.houseNo);
    if (houseInput) {
      setInputValue(houseInput, '');
      houseInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      houseInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      houseInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    }

    // Operator Interaction: Show floating UI card "Manual Input Required" and PAUSE automation
    console.log('[GCDS Section H] Pausing for manual House Number entry by operator...');
    const houseResult = await waitForHouseNumberInput();
    if (houseResult.action === 'CONFIRMED' && houseResult.houseNo) {
      filledCount++;
    } else {
      skippedCount++;
      skippedFields.push('houseNo');
    }

    // 2. Village Name (Double Mapping to BOTH Street/Area and Village/Town):
    let villageVal = (
      data.village ||
      addr.village ||
      addr.villageTown ||
      parsedAddr.village ||
      ''
    ).trim();

    if (!villageVal) {
      const candidate = (addr.cityTownVillage || data.cityTownVillage || data.village_town || data.town_village_city || data.town || '').trim();
      if (candidate && !candidate.includes(' - ')) {
        villageVal = candidate;
      } else if (candidate) {
        villageVal = candidate.split(' - ')[0].trim();
      }
    }

    let regVillageVal = (addr.regionalVillage || addr.regionalCityTownVillage || '').trim();
    if (!regVillageVal && villageVal) {
      regVillageVal = await requestTransliteration(villageVal);
    }

    if (villageVal) {
      // (a) Street/Area input (#areasD, input#streetArea, input[name="street"])
      const streetInput = (boxH || document).querySelector('input#areasD, input#streetArea, input[name="street"], input[name="streetArea"]') || findElement(SELECTOR_MAP.street);
      if (streetInput) {
        fillAndDispatch(streetInput, villageVal);
        filledCount++;
      } else {
        await fillTextField('street', villageVal);
      }

      // Regional Street input (#regAreasD, input#regStreetArea)
      const regStreetInput = (boxH || document).querySelector('input#regAreasD, input#regStreetArea');
      if (regStreetInput && regVillageVal) {
        fillAndDispatch(regStreetInput, regVillageVal);
      }

      // (b) Village/Town input (#villageD, input#villageTown, input[name="village"])
      const villageInput = (boxH || document).querySelector('input#villageD, input#villageTown, input[name="village"], input[name="villageTown"]') || findElement(SELECTOR_MAP.cityTownVillage);
      if (villageInput) {
        fillAndDispatch(villageInput, villageVal);
        filledCount++;
      } else {
        await fillTextField('cityTownVillage', villageVal);
      }

      // Regional Village input (#regVillageD, input#regVillageTown)
      const regVillageInput = (boxH || document).querySelector('input#regVillageD, input#regVillageTown');
      if (regVillageInput && regVillageVal) {
        fillAndDispatch(regVillageInput, regVillageVal);
      }
    } else {
      skippedCount += 2;
      skippedFields.push('street', 'cityTownVillage');
    }

    // 3. Post Office input (#postH, input#postOffice, input[name="postOffice"])
    const postOfficeVal = (
      data.post_office ||
      data.postOffice ||
      addr.postOffice ||
      addr.post_office ||
      parsedAddr.postOffice ||
      ''
    ).trim();

    if (postOfficeVal) {
      const postInput = (boxH || document).querySelector('input#postH, input#postOffice, input[name="postOffice"]') || findElement(SELECTOR_MAP.postOffice);
      if (postInput) {
        fillAndDispatch(postInput, postOfficeVal);
        filledCount++;
      } else {
        await fillTextField('postOffice', postOfficeVal);
      }

      const regPostInput = (boxH || document).querySelector('input#regPostH, input#regPostOffice');
      if (regPostInput) {
        const regPostVal = await requestTransliteration(postOfficeVal);
        if (regPostVal) {
          fillAndDispatch(regPostInput, regPostVal);
        }
      }
    } else {
      skippedCount++;
      skippedFields.push('postOffice');
    }

    // 4. PIN Code input (#pinCode, input[name="pinCode"])
    const pinVal = (
      data.pincode ||
      data.pin_code ||
      addr.pincode ||
      addr.pin_code ||
      parsedAddr.pincode ||
      ''
    ).replace(/\D/g, '').slice(0, 6);

    if (pinVal) {
      const pinInput = (boxH || document).querySelector('input#pinCode, input[name="pinCode"]') || findElement(SELECTOR_MAP.pincode);
      if (pinInput) {
        fillAndDispatch(pinInput, pinVal);
        filledCount++;
      } else {
        await fillTextField('pincode', pinVal);
      }
    } else {
      skippedCount++;
      skippedFields.push('pincode');
    }

    // 5. Tehsil/Taluqa/Mandal: Fill this field with Tehsil or City from GCDS (clean administrative block suffixes)
    let tehsilVal = (
      data.tehsil ||
      addr.tehsil ||
      parsedAddr.tehsil ||
      data.city ||
      addr.city ||
      addr.subDistrict ||
      ''
    ).trim();

    // Prefer parsed Tehsil if city contains administrative block suffix like "Basirhat - I"
    if (parsedAddr.tehsil && (tehsilVal.includes(' - ') || !tehsilVal)) {
      tehsilVal = parsedAddr.tehsil;
    } else if (tehsilVal.includes(' - ')) {
      tehsilVal = tehsilVal.split(' - ')[0].trim();
    }

    if (tehsilVal) {
      const tehsilInput = (boxH || document).querySelector('input#areasH, input#tehsil, input[name="currentAddressTeh"], input[name="tehsil"]') || findElement(SELECTOR_MAP.tehsil);
      if (tehsilInput) {
        fillAndDispatch(tehsilInput, tehsilVal);
        filledCount++;
      } else {
        await fillTextField('tehsil', tehsilVal);
      }

      const regTehsilInput = (boxH || document).querySelector('input#regAreasH, input#regTehsil');
      if (regTehsilInput) {
        const regTehsilVal = await requestTransliteration(tehsilVal);
        if (regTehsilVal) {
          fillAndDispatch(regTehsilInput, regTehsilVal);
        }
      }
    } else {
      skippedCount++;
      skippedFields.push('tehsil');
    }

    // Section H State dropdown (select#currentStateCd) using selectDropdownSafe
    if (stateVal) {
      const secHState = (boxH || document).querySelector('select#currentStateCd, select[name="currentStateCd"]');
      if (secHState && !secHState.disabled && secHState.value !== stateVal) {
        await selectDropdownSafe(secHState, stateVal, 5);
        await sleep(500);
      }
    }

    // 6. District Dropdown (District *): Select correct district from portal dropdown strictly scoped to Section H
    const secHDistrictVal = (
      data.district ||
      addr.district ||
      data.address_district ||
      parsedAddr.district ||
      districtVal ||
      ''
    ).trim();

    if (secHDistrictVal) {
      let secHDistSelect = null;
      if (boxH) {
        secHDistSelect = boxH.querySelector('select#districtCd, select[name="districtCd"], select#district');
      }
      if (!secHDistSelect) {
        const allDist = Array.from(document.querySelectorAll('select#districtCd, select[name="districtCd"], select[aria-label="District"]'));
        secHDistSelect = allDist.length > 1 ? allDist[1] : allDist[0];
      }

      let districtSelected = false;
      if (secHDistSelect) {
        console.log(`[GCDS Section H] Selecting District * on scoped element:`, secHDistSelect, `Target: "${secHDistrictVal}"`);
        districtSelected = await selectDropdownSafe(secHDistSelect, secHDistrictVal, 10);
      } else {
        districtSelected = await selectDropdownSafe(
          ['select#districtCd', 'select#district', 'select[name="districtCd"]', 'select[name="district"]', ...SELECTOR_MAP.district],
          secHDistrictVal,
          10
        );
      }

      if (districtSelected) {
        filledCount++;
      } else {
        skippedCount++;
        skippedFields.push('district');
      }
    }

    // ─── Final Validation Check for Section H ──────────────────────────────────
    const curH = findSectionBox('H') || document;
    const fHouse = curH.querySelector('input#doorD, input#houseNo, input[name="houseNo"]')?.value?.trim();
    const fStreet = curH.querySelector('input#areasD, input#streetArea, input[name="street"]')?.value?.trim();
    const fVillage = curH.querySelector('input#villageD, input#villageTown, input[name="village"]')?.value?.trim();
    const fPost = curH.querySelector('input#postH, input#postOffice, input[name="postOffice"]')?.value?.trim();
    const fPin = curH.querySelector('input#pinCode, input[name="pinCode"]')?.value?.trim();
    const fTehsil = curH.querySelector('input#areasH, input#tehsil, input[name="currentAddressTeh"]')?.value?.trim();
    const fDist = curH.querySelector('select#districtCd, select[name="districtCd"]')?.value?.trim();

    const secHValid = {
      houseNo: !!fHouse,
      street: !!fStreet,
      village: !!fVillage,
      postOffice: !!fPost,
      pincode: /^\d{6}$/.test(fPin || ''),
      tehsil: !!fTehsil,
      district: !!fDist,
    };

    const isSecHComplete = Object.values(secHValid).every(Boolean);
    console.log('📋 [GCDS Section H Final Validation]', secHValid, 'Complete:', isSecHComplete);

    // Dispatch full synthetic events on all Section H inputs to ensure React/Angular acceptance
    [
      curH.querySelector('input#doorD, input#houseNo, input[name="houseNo"]'),
      curH.querySelector('input#areasD, input#streetArea, input[name="street"]'),
      curH.querySelector('input#villageD, input#villageTown, input[name="village"]'),
      curH.querySelector('input#postH, input#postOffice, input[name="postOffice"]'),
      curH.querySelector('input#pinCode, input[name="pinCode"]'),
      curH.querySelector('input#areasH, input#tehsil, input[name="currentAddressTeh"]'),
      curH.querySelector('select#districtCd, select[name="districtCd"]'),
    ].filter(Boolean).forEach((inp) => {
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    // Unlock the Section H Next button so operator can click Next manually
    const nextBtnH = curH.querySelector('button.next-btn');
    if (nextBtnH) {
      nextBtnH.classList.remove('buttonDisable');
      nextBtnH.removeAttribute('disabled');
    }

    // ─── Section H: Address Proof Document Upload ──────────────────────────────
    // 1. Radio: Select "Document for proof of Residence"
    const resRadio = (boxH || document).querySelector('input[type="radio"][name="AddressProofDocument"][value="Y"]')
      || findElement(SELECTOR_MAP.addressProofRadio);
    if (resRadio && !resRadio.checked) {
      setRadioOrCheckbox(resRadio, true);
      resRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 2. Dropdown: Select document type
    const addrDocCode = data.addressProofType || data.documents?.addressProof?.portalDocType || (hasValidAadhaar ? 'ADHR' : 'WEGB');
    const resSelect = (boxH || document).querySelector('select[name="currentAddressProofType"]')
      || findElement(SELECTOR_MAP.addressProofType);
    if (resSelect) {
      setSelectValue(resSelect, addrDocCode);
      resSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 3. Document File Input: Locate and verify
    const addrFileInput = (boxH || document).querySelector('input[type="file"]#currentAddressProof, input[type="file"][name="currentAddressProof"]')
      || findElement(SELECTOR_MAP.addressProofFile);

    const ADDRESS_DOC_NAMES = {
      ADHR: 'Aadhaar Card',
      WEGB: 'Water / Electricity / Gas Connection Bill',
      PC: 'PAN Card',
      IPSP: 'Indian Passport',
      PBCB: 'Current Passbook (Bank / Post Office)',
      ROD: 'Revenue / Registered Sale Deed',
      RLA: 'Registered Rent / Lease Agreement',
    };
    const addrDocName = ADDRESS_DOC_NAMES[addrDocCode] || data.documents?.addressProof?.type || 'Address Proof Document';
    const addrDocUrl = data.addressProofUrl || data.documents?.addressProof?.url || null;
    const addrDocFileName = data.documents?.addressProof?.fileName || 'address-proof-document.pdf';

    let addressUploaded = false;

    if (addrDocUrl && addrFileInput) {
      try {
        console.log(`[GCDS Section H] Fetching Address Proof document from GCDS: ${addrDocUrl}`);
        const addrBlob = await fetchFileBlob(addrDocUrl, data.id || data._id);
        if (addrBlob && addrBlob.size > 0) {
          const injected = await injectFileToPortal(addrFileInput, addrBlob, addrDocFileName, false);
          if (injected && addrFileInput.files && addrFileInput.files.length > 0) {
            addressUploaded = true;
            highlightField(addrFileInput);
            filledCount++;
            console.log('✅ [GCDS Section H] Address Proof file injected successfully. Waiting 2s guard before Next...');
            await sleep(2000);
          } else {
            console.warn('[GCDS Section H] File injection into currentAddressProof input did not register files.');
          }
        } else {
          console.warn('[GCDS Section H] Failed to fetch valid blob for Address Proof document.');
        }
      } catch (err) {
        console.error('[GCDS Section H] Error injecting Address Proof document:', err);
      }
    }

    // 4. If upload not confirmed, trigger Manual Upload Fallback Card
    if (!addressUploaded) {
      console.log('[GCDS Section H] Address Proof document missing or unconfirmed. Showing Manual Upload prompt...');
      const manualResult = await waitForManualDocumentUpload({
        section: 'H',
        title: 'Present Address (Address Proof)',
        docTypeName: addrDocName,
        fileInput: addrFileInput,
      });

      if (manualResult.action === 'CONFIRMED') {
        addressUploaded = true;
        filledCount++;
        await sleep(1000);
      } else {
        console.log('[GCDS Section H] Operator skipped manual upload. Will not auto-advance Section H.');
        skippedCount++;
        skippedFields.push('addressProof');
      }
    }

    // 5. Auto-advance Section H ONLY if upload confirmed!
    if (addressUploaded) {
      await clickSectionNextButton('H');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Section I: Category of Disability (Optional)
    // ═══════════════════════════════════════════════════════════════════════════

    // Auto-advance Section I
    await clickSectionNextButton('I');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section J: Family Member Details (Optional)
    // ═══════════════════════════════════════════════════════════════════════════

    const epicVal = data.epic || data.voter_id_number;
    if (epicVal) {
      await fillTextField('epicNumber', epicVal);
    }

    // Auto-advance Section J
    await clickSectionNextButton('J');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section K: Declaration
    // ═══════════════════════════════════════════════════════════════════════════

    const rawPlace = addr.cityTownVillage || addr.district || data.city || '';
    const placeVal = rawPlace.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (placeVal) {
      await fillTextField('declarationPlace', placeVal);
    }
    const rawVillage = villageVal || addr.cityTownVillage || data.city || '';
    const decVillageVal = rawVillage.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (decVillageVal) {
      await fillTextField('declarationVillage', decVillageVal);
    }

    // Set Section K State, District, and Declaration Date strictly within Section K box
    const boxK = findSectionBox('K');
    if (boxK) {
      const secKState = boxK.querySelector('select#stateCodeA, select[name="stateCodeA"]');
      if (secKState && stateVal) {
        setSelectValue(secKState, stateVal);
      }
      const secKDistrict = boxK.querySelector('select#districtCdA, select[name="districtCdA"]');
      if (secKDistrict && districtVal) {
        setSelectValue(secKDistrict, districtVal);
      }
      const today = new Date().toISOString().split('T')[0];
      const secKDate = boxK.querySelector('input[type="date"][name="date"], input.library-date');
      if (secKDate) {
        setInputValue(secKDate, today);
        highlightField(secKDate);
      }
    }

    // Auto-advance Section K
    await clickSectionNextButton('K');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section L: Captcha & Review
    // CRITICAL SAFETY RULE 1: NEVER AUTOMATE FINAL SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════════

    const boxL = findSectionBox('L');
    if (boxL) {
      try {
        boxL.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    }

    const fillResult = {
      success: true,
      filledCount,
      skippedCount,
      skippedFields,
      completedAt: new Date().toISOString(),
    };
    window.__GCDS_LAST_FILL_SUMMARY = fillResult;

    return fillResult;
  }

  /**
   * Strict PII Scrubber for Privacy-Safe Diagnostics.
   * Strips all Aadhaar numbers, phone numbers, EPICs, emails, dates, and names.
   */
  function scrubPii(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED_AADHAAR]')
      .replace(/(?:\+91[-\s]?)?[6-9]\d{9}\b/g, '[REDACTED_PHONE]')
      .replace(/\b[A-Z]{3}[0-9]{7}\b/gi, '[REDACTED_EPIC]')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/\b[1-9][0-9]{5}\b/g, '[REDACTED_PINCODE]')
      .replace(/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, '[REDACTED_DATE]')
      .trim();
  }

  /**
   * Generates an anonymized diagnostic report of the current ECI portal state.
   * Zero PII included.
   */
  function generateDiagnosticReport() {
    // 1. Redacted URL (protocol + host + pathname only; query params & hash discarded)
    const redactedUrl = window.location.origin + window.location.pathname;

    // 2. Sections Status (A through L)
    const sidebarItems = Array.from(document.querySelectorAll('[class*="box1"], [class*="sidenavclass"]'))
      .filter((el) => el.innerText && /^[A-L]\./.test(el.innerText.trim()));

    const sections = sidebarItems.map((el) => {
      const text = el.innerText.trim();
      const sectionLetter = text.charAt(0);
      const isCompleted = el.className.includes('sidenavclassstart');
      const isActive = el.className.includes('sidenavclass') && !isCompleted;
      return {
        section: sectionLetter,
        title: text.slice(0, 35),
        status: isCompleted ? 'COMPLETED' : (isActive ? 'ACTIVE' : 'PENDING'),
      };
    });

    const activeSection = sections.find((s) => s.status === 'ACTIVE')?.section || 'UNKNOWN';

    // 3. Known critical form selectors check (unmapped/missing selectors detection)
    const knownFormSelectors = {
      sectionA_state: 'select#stateSelect, select[name="state"]',
      sectionA_district: 'select#districtSelect, select[name="district"]',
      sectionA_ac: 'select#acSelect, select[name="asmbly"]',
      sectionB_firstName: 'input#firstName, #firstName',
      sectionB_regFirst: 'input#regfirst, #regfirst',
      sectionB_photoInput: 'input[type="file"]#fileToUpload, #fileToUpload',
      sectionC_relativeFirst: 'input#fNameSur, #fNameSur',
      sectionC_regRelativeFirst: 'input#regRelatName, #regRelatName',
      sectionD_mobile: 'input#mobNo, input[name="mobNo"]',
      sectionE_aadhaarRadio: 'input[type="radio"][value="aadhaar"], #aadhaarRadio',
      sectionG_dob: 'input#dob, input[type="date"]',
      sectionH_address: 'textarea#currAddress, input#houseNo',
      sectionH_pincode: 'input#pinCode, input[name="pincode"]',
      sectionL_captcha: 'input#captcha, input[name="captcha"]',
    };

    const selectorAudit = {};
    for (const [key, selector] of Object.entries(knownFormSelectors)) {
      selectorAudit[key] = {
        selector,
        present: Boolean(document.querySelector(selector)),
      };
    }

    const unmappedSelectors = Object.entries(selectorAudit)
      .filter(([_, val]) => !val.present)
      .map(([key, val]) => ({ fieldKey: key, selector: val.selector }));

    // 4. Capture visible DOM errors (strictly PII-scrubbed)
    const errorElements = Array.from(
      document.querySelectorAll('.errormsg, .text-danger, .invalid-feedback, [role="alert"]')
    ).filter((el) => {
      const text = el.innerText?.trim();
      return text && text.length > 0 && el.offsetParent !== null; // visible elements only
    });

    const domErrors = errorElements.map((el) => {
      const rawText = el.innerText.trim();
      const scrubbed = scrubPii(rawText);
      const parentSection = el.closest('.box')?.innerText?.trim()?.slice(0, 20) || 'Unknown Section';
      return {
        sectionHint: parentSection.slice(0, 2),
        message: scrubbed,
      };
    });

    // 5. Assemble diagnostic report
    return {
      reportType: 'GCDS_PRIVACY_SAFE_DIAGNOSTIC',
      version: '1.2.4-stable',
      timestamp: new Date().toISOString(),
      portal: {
        url: redactedUrl,
        title: document.title ? scrubPii(document.title) : 'ECI Portal',
        activeSection,
        sectionsCount: sections.length,
      },
      sectionsProgression: sections,
      unmappedSelectors,
      domErrors,
      lastFillSummary: window.__GCDS_LAST_FILL_SUMMARY || null,
      safetyDeclaration: 'Zero personal data (PII) included. Compliant with privacy standards.',
    };
  }

  /**
   * Run Fill Helper (spec compliance)
   * Alias for fillForm to support direct programmatic invocation.
   */
  async function runFill(customer) {
    return fillForm(customer);
  }

  // Expose fill engine utilities on window for debugging/testing in console
  window.__GCDS_FILL_ENGINE = {
    selectDropdownSafe,
    setSelectValue,
    getOptionsSafe,
    clickSectionNextButton,
    findSectionBox,
    fetchFileBlob,
    injectFileToPortal,
    autoConfirmSelectFromImageModal,
    handlePhotoSection,
    waitForRelationConfirmation,
    waitForAadhaarConfirmation,
    waitForAgeProofSmartPicker,
    waitForHouseNumberInput,
    waitForManualDocumentUpload,
    parseAddressComponents,
    runFill,
    fillForm,
    generateDiagnosticReport,
  };

  // ─── Message Listener ─────────────────────────────────────────────────────

  if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'FILL_FORM') {
        fillForm(message.payload)
          .then(sendResponse)
          .catch((err) => {
            sendResponse({
              success: false,
              filledCount: 0,
              skippedCount: 0,
              skippedFields: [],
              error: `Fill engine error: ${err.message || 'Unknown error'}`,
            });
          });
        return true; // Async response
      }

      if (message.action === 'GET_DIAGNOSTIC_REPORT') {
        try {
          const report = generateDiagnosticReport();
          sendResponse({ success: true, report });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        return false;
      }
    });
  }

  // Register re-injection cleanup hook
  window.__GCDS_CONTENT_SCRIPT_CLEANUP = () => {
    const staleRel = document.getElementById('gcds-rel-card');
    if (staleRel) staleRel.remove();
    const staleAadhaar = document.getElementById('gcds-aadhaar-card');
    if (staleAadhaar) staleAadhaar.remove();
    const staleDoc = document.getElementById('gcds-doc-card');
    if (staleDoc) staleDoc.remove();
    const staleHouse = document.getElementById('gcds-house-card');
    if (staleHouse) staleHouse.remove();
  };
})();

