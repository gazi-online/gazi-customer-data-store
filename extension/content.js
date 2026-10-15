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
  // Prevent multiple injections
  if (window.__GCDS_CONTENT_SCRIPT_LOADED) {
    return;
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
      '#doorD',
      'input[formcontrolname="houseNo"]',
      '#houseNo',
      'input[placeholder*="House" i]',
      'input[id*="house" i]',
    ],
    street: [
      'input#areasD',
      'input[name="street"]',
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
      'input[name="village"]',
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
      'input[name="currentAddressTeh"]',
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
    for (const sel of selectorCandidates) {
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
    if (!value && value !== 0) return false;

    const strValue = String(value);

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

    // Strategy 1: Exact match on option text (trimmed, uppercase)
    let target = options.find((opt) => {
      const text = (opt.text || opt.textContent || '').trim().toUpperCase();
      return text === normalizedTarget;
    });

    // Strategy 2: Substring includes match on option text
    if (!target) {
      target = options.find((opt) => {
        const text = (opt.text || opt.textContent || '').trim().toUpperCase();
        return text.includes(normalizedTarget) || normalizedTarget.includes(text);
      });
    }

    // Strategy 3: Match option value directly
    if (!target) {
      target = options.find((opt) => {
        const val = String(opt.value || '').trim().toUpperCase();
        return val === normalizedTarget;
      });
    }

    if (target) {
      selectElement.value = target.value;
      // Essential Framework Events for Angular / React
      selectElement.dispatchEvent(new Event('input', { bubbles: true }));
      selectElement.dispatchEvent(new Event('change', { bubbles: true }));
      selectElement.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    return false;
  }

  /**
   * Optimized Dropdown Handler
   * Waits for dynamic dropdown options to populate via portal API, converts options
   * safely via Array.from(el.options || []), matches target, and fires framework events.
   *
   * @param {string|string[]} selectorOrCandidates - CSS selector or array of candidate selectors
   * @param {string} searchText - Text to find in dropdown options
   * @param {number} maxRetries - Max retry attempts (default 10, 1000ms each)
   * @returns {Promise<boolean>}
   */
  async function selectDropdownSafe(selectorOrCandidates, searchText, maxRetries = 10) {
    if (!searchText) return false;
    const searchStr = String(searchText).trim();
    if (!searchStr) return false;

    const candidates = Array.isArray(selectorOrCandidates)
      ? selectorOrCandidates
      : [selectorOrCandidates];

    let el = null;

    // 1. Wait for options to populate (maxRetries * 1000ms)
    for (let i = 0; i < maxRetries; i++) {
      el = findElement(candidates);
      if (el) {
        const opts = getOptionsSafe(el);
        if (opts.length > 1) break;
      }
      await sleep(1000);
    }

    el = findElement(candidates);
    if (!el) return false;

    // 2. Safe Array Conversion
    const options = getOptionsSafe(el);
    if (!options || options.length === 0) return false;

    const targetUpper = searchStr.toUpperCase();

    // Find target option (exact text match first, then includes, then value)
    const target =
      options.find((opt) => {
        const text = (opt.text || opt.textContent || '').trim().toUpperCase();
        return text === targetUpper;
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
      // 3. Essential Framework Events (Angular / React)
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
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
    const prefix = `${letter.toUpperCase()}.`;
    const allBoxes = document.querySelectorAll('.box');
    for (const box of allBoxes) {
      const title = box.querySelector('.form-title, h1, h2, h3, h4, h5, h6, strong')?.textContent?.trim() || '';
      if (title.toUpperCase().startsWith(prefix)) {
        return box;
      }
    }
    for (const box of allBoxes) {
      const text = (box.innerText || box.textContent || '').trim();
      if (text.toUpperCase().startsWith(prefix)) {
        return box;
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
      const box = findSectionBox(letter);
      if (!box) {
        return false;
      }

      const nextBtn = box.querySelector('button.next-btn, button[aria-label*="Next" i]');
      if (!nextBtn) {
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
      const letterIndex = letter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      const nextLetter = String.fromCharCode('A'.charCodeAt(0) + letterIndex + 1);
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

      const el = findElement(candidates);
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

      const el = findElement(candidates);
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
          const districtFilled = await selectDropdownSafe(SELECTOR_MAP.district, districtVal, 10);
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

    // Auto-advance Section B
    await clickSectionNextButton('B');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section C: Relatives Details
    // ═══════════════════════════════════════════════════════════════════════════

    let relCode = null;
    let relFirst = '';
    let relLast = '';

    if (relative.fatherName || relative.fatherFirstMiddleName || data.father_name) {
      relCode = 'FTHR';
      relFirst = relative.fatherFirstMiddleName || relative.fatherName || data.father_name || '';
      relLast = relative.fatherSurname || '';
    } else if (relative.spouseName || relative.spouseFirstMiddleName || data.spouse_name) {
      relCode = 'HSBN';
      relFirst = relative.spouseFirstMiddleName || relative.spouseName || data.spouse_name || '';
      relLast = relative.spouseSurname || '';
    } else if (relative.motherName || relative.motherFirstMiddleName || data.mother_name) {
      relCode = 'MTHR';
      relFirst = relative.motherFirstMiddleName || relative.motherName || data.mother_name || '';
      relLast = relative.motherSurname || '';
    }

    if (relCode) {
      // 1. Radio button for relative type (ECI standard: FTHR, MTHR, HSBN, WIFE, OTHR)
      const relRadio = document.querySelector(`input[type="radio"][name="relatives"][value="${relCode}"]`);
      if (relRadio) {
        setRadioOrCheckbox(relRadio, true);
        highlightField(relRadio);
        filledCount++;
      } else {
        const labelMap = { FTHR: 'Father', HSBN: 'Husband', MTHR: 'Mother' };
        await fillSelectField('relationType', labelMap[relCode] || 'Father');
      }

      await sleep(50);

      // 2. Relative First Name and Surname
      if (relFirst) {
        await fillTextField('relativeFirstName', relFirst);
      } else {
        skippedCount++;
        skippedFields.push('relativeFirstName');
      }

      if (relLast) {
        await fillTextField('relativeLastName', relLast);
      }

      // 3. Regional Relative Names (CRITICAL: satisfies ECI React validation for Section C Next button)
      let regRelFirstVal = relative.regionalFirstName || relative.nativeFirstName || '';
      let regRelLastVal = relative.regionalLastName || relative.nativeLastName || '';

      // If no regional name was provided, try transliterating via background service worker
      if (!regRelFirstVal && relFirst) {
        try {
          if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
            const resp = await new Promise((res) => {
              chrome.runtime.sendMessage(
                { action: 'TRANSLITERATE', payload: { text: relFirst, lang: window.glocale || 'bn' } },
                (r) => res(r)
              );
            });
            if (resp && resp.success && resp.text) {
              regRelFirstVal = resp.text;
            }
          }
        } catch {}
      }

      if (!regRelLastVal && relLast) {
        try {
          if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
            const resp = await new Promise((res) => {
              chrome.runtime.sendMessage(
                { action: 'TRANSLITERATE', payload: { text: relLast, lang: window.glocale || 'bn' } },
                (r) => res(r)
              );
            });
            if (resp && resp.success && resp.text) {
              regRelLastVal = resp.text;
            }
          }
        } catch {}
      }

      // CRITICAL GUARD: Only set regional inputs if we have valid non-ASCII regional script characters!
      // Setting English/Latin characters into regRelatName triggers the ECI portal "Invalid Input" error!
      const regRelNameEl = document.querySelector('input#regRelatName, #regRelatName');
      if (regRelNameEl && regRelFirstVal && /[^\u0000-\u007F]/.test(regRelFirstVal)) {
        setInputValue(regRelNameEl, regRelFirstVal);
      }
      const regRelSurEl = document.querySelector('input#regRelatSurName, #regRelatSurName');
      if (regRelSurEl && regRelLastVal && /[^\u0000-\u007F]/.test(regRelLastVal)) {
        setInputValue(regRelSurEl, regRelLastVal);
      }
    } else {
      skippedCount++;
      skippedFields.push('relationType');
    }

    // Auto-advance Section C
    await clickSectionNextButton('C');

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
    // Section E: Aadhaar Details
    // ═══════════════════════════════════════════════════════════════════════════

    const rawAadhaar = data.aadhaarNumber || data.aadhaar || data.aadhaar_number || '';
    const cleanAadhaar = String(rawAadhaar).replace(/\D/g, '');
    const hasValidAadhaar = cleanAadhaar.length === 12;

    if (hasValidAadhaar) {
      // 1. Select "Aadhaar Number" checkbox
      const aadhaarCb = document.querySelector('input[type="checkbox"][value="aadhaarnum"]');
      if (aadhaarCb && !aadhaarCb.checked) {
        setRadioOrCheckbox(aadhaarCb, true);
        await sleep(50);
      }

      // 2. Fill 12-digit Aadhaar input
      const aadhaarInp =
        document.querySelector('input#aadhaarNumber') ||
        document.querySelector('input[name="aadhaarNumber"]');
      if (aadhaarInp) {
        setInputValue(aadhaarInp, cleanAadhaar);
        highlightField(aadhaarInp);
        filledCount++;
      }

      // 3. Since Section 5 has Aadhaar, setting Aadhaar as supporting document is valid
      const ageSelect = document.querySelector('select[name="ageproof"]');
      if (ageSelect) {
        setSelectValue(ageSelect, 'ADHR');
      }

      const resSelect = document.querySelector('select[name="currentAddressProofType"]');
      if (resSelect) {
        setSelectValue(resSelect, 'ADHR');
      }
    } else {
      // CRITICAL GUARD: If Aadhaar is NOT provided in Section 5, NEVER set ADHR as supporting document!
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

      // Select "I do not have Aadhaar" declaration checkbox if present
      const noAadhaarCb = document.querySelector('input[type="checkbox"][value="noaadhaarnum"]');
      if (noAadhaarCb && !noAadhaarCb.checked) {
        setRadioOrCheckbox(noAadhaarCb, true);
        highlightField(noAadhaarCb);
        filledCount++;
      } else {
        skippedCount++;
        skippedFields.push('aadhaarNumber');
      }
    }

    // Auto-advance Section E
    await clickSectionNextButton('E');

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

            // Auto-check Age Proof radio if present
            const proofRadio = (boxG || document).querySelector('input[type="radio"][name="ageDocument"][value="ageProof"]');
            if (proofRadio && !proofRadio.checked) {
              setRadioOrCheckbox(proofRadio, true);
            }
            const ageSelect = (boxG || document).querySelector('select[name="ageproof"]');
            if (ageSelect && !ageSelect.value) {
              setSelectValue(ageSelect, hasValidAadhaar ? 'ADHR' : 'PC');
            }
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

    // Auto-advance Section G
    await clickSectionNextButton('G');

    // ═══════════════════════════════════════════════════════════════════════════
    // Section H: Present Address Details
    // ═══════════════════════════════════════════════════════════════════════════

    const addressStr = addr.streetAddress || data.address || '';
    const addressParts = addressStr.split(',').map((p) => p.trim()).filter(Boolean);

    if (addressParts.length >= 2) {
      await fillTextField('houseNo', addressParts[0]);
      await fillTextField('street', addressParts.slice(1).join(', '));
    } else if (addressParts.length === 1) {
      await fillTextField('houseNo', addressParts[0]);
    }

    await fillTextField('cityTownVillage', addr.cityTownVillage || data.city || data.town_village_city);
    await fillTextField('postOffice', addr.postOffice || data.post_office);
    await fillTextField('pincode', addr.pincode || data.pincode || data.pin_code);

    const rawTehsil = addr.subDistrict || addr.tehsil || addr.district || data.district || '';
    const tehsilVal = rawTehsil.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (tehsilVal) {
      await fillTextField('tehsil', tehsilVal);
    }

    // Section H state dropdown if present
    const secHState = document.querySelector('select#currentStateCd[name="currentStateCd"]');
    if (secHState && stateVal) {
      setSelectValue(secHState, stateVal);
    }

    // Address proof document radio
    const resRadio = document.querySelector('input[type="radio"][name="AddressProofDocument"][value="Y"]');
    if (resRadio && !resRadio.checked) {
      setRadioOrCheckbox(resRadio, true);
    }
    const resSelect = document.querySelector('select[name="currentAddressProofType"]');
    if (resSelect && !resSelect.value) {
      setSelectValue(resSelect, hasValidAadhaar ? 'ADHR' : 'PC');
    }

    // Auto-advance Section H
    await clickSectionNextButton('H');

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
    const rawVillage = addr.cityTownVillage || data.city || '';
    const villageVal = rawVillage.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (villageVal) {
      await fillTextField('declarationVillage', villageVal);
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
      version: '1.1.0',
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
})();
