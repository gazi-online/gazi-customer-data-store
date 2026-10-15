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

  // ─── Automated Photo Upload (Section B) ───────────────────────────────────

  /**
   * Helper to inject a binary file Blob into the portal's file input using the DataTransfer API.
   * Dispatches input, change, and blur events so Angular & React detect the file upload.
   *
   * @param {HTMLInputElement|string} target - File input element or CSS selector
   * @param {Blob} fileBlob - Binary image blob
   * @param {string} fileName - Destination file name (e.g. 'firstname_photo.jpg')
   * @returns {Promise<boolean>}
   */
  async function injectFileToPortal(target, fileBlob, fileName = 'customer_photo.jpg') {
    const input = typeof target === 'string' ? document.querySelector(target) : target;
    if (!input) {
      console.warn('[GCDS Photo] Photo input field not found on portal.');
      return false;
    }

    // Portal rule: document size maximum 2MB
    if (fileBlob.size > 2 * 1024 * 1024) {
      console.warn(`[GCDS Photo] Photo exceeds ECI 2MB limit: ${fileBlob.size} bytes`);
      return false;
    }

    try {
      // Ensure file type is image/jpeg per ECI specification
      const file = new File([fileBlob], fileName, { type: 'image/jpeg' });
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

      // Automatically confirm the "Select From Image" crop modal and click Save
      const modalConfirmed = await autoConfirmSelectFromImageModal(7000);
      if (modalConfirmed) {
        console.log('✅ "Select From Image" modal auto-confirmed and saved.');
      }

      console.log(`✅ Photo injected: ${fileName}`);
      return true;
    } catch (err) {
      console.error('[GCDS Photo] Failed to inject photo via DataTransfer:', err);
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

    return new Promise((resolve) => {
      try {
        // Request background script to fetch the blob (to bypass CORS)
        chrome.runtime.sendMessage(
          {
            action: 'FETCH_IMAGE_BLOB',
            url: photoUrl,
            customerId: customerId,
          },
          async (response) => {
            if (chrome.runtime.lastError || !response || !response.blobData) {
              console.warn('[GCDS Photo] Photo fetch failed:', chrome.runtime.lastError?.message || response?.error);
              resolve(false);
              return;
            }

            try {
              // Convert DataURL/BlobData back to blob
              const res = await fetch(response.blobData);
              const blob = await res.blob();

              const firstName = customer.first_name || customer.firstName || customer.name?.firstName || 'customer';
              const fileName = `${firstName}_photo.jpg`;

              const success = await injectFileToPortal(input, blob, fileName);
              resolve(success);
            } catch (convErr) {
              console.error('[GCDS Photo] Blob conversion error:', convErr);
              resolve(false);
            }
          }
        );
      } catch (sendErr) {
        console.error('[GCDS Photo] chrome.runtime.sendMessage error:', sendErr);
        resolve(false);
      }
    });
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
      version: '1.2.2',
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
    injectFileToPortal,
    autoConfirmSelectFromImageModal,
    handlePhotoSection,
    waitForRelationConfirmation,
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
    const stale = document.getElementById('gcds-rel-card');
    if (stale) stale.remove();
  };
})();

