/**
 * GAZI SMART FORM FILLER — Popup Controller
 * File: extension/popup.js
 *
 * Handles all popup UI interactions: search, customer selection,
 * identity confirmation, settings management, and form fill invocation.
 *
 * Security Invariants:
 * - Never logs customer PII (Aadhaar, PAN, phone) to console.
 * - Shows masked mobile only in search results.
 * - Requires explicit user confirmation before filling any form.
 */

// ─── DOM References ──────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Views
const viewSearch = $('#view-search');
const viewConfirm = $('#view-confirm');
const viewSettings = $('#view-settings');

// Status bar
const statusBar = $('#status-bar');
const statusDot = $('#status-dot');
const statusText = $('#status-text');

// Search
const searchInput = $('#search-input');
const btnClearSearch = $('#btn-clear-search');
const searchResults = $('#search-results');
const searchLoading = $('#search-loading');
const searchEmpty = $('#search-empty');
const searchInitial = $('#search-initial');

// Confirm
const confirmAvatar = $('#confirm-avatar');
const confirmName = $('#confirm-name');
const confirmCode = $('#confirm-code');
const confirmPhone = $('#confirm-phone');
const confirmDob = $('#confirm-dob');
const confirmGender = $('#confirm-gender');
const confirmAddress = $('#confirm-address');
const confirmEpic = $('#confirm-epic');
const confirmAC = $('#confirm-ac');
const confirmElectoralStatus = $('#confirm-electoral-status');
const btnFillForm = $('#btn-fill-form');
const fillStatus = $('#fill-status');
const fillStatusIcon = $('#fill-status-icon');
const fillStatusText = $('#fill-status-text');

// Settings
const settingsApiUrl = $('#settings-api-url');
const settingsToken = $('#settings-token');
const settingsStatus = $('#settings-status');
const btnToggleToken = $('#btn-toggle-token');
const iconEye = $('#icon-eye');
const iconEyeOff = $('#icon-eye-off');

// Diagnostics
const btnCopyDiagnostics = $('#btn-copy-diagnostics');
const btnConfirmDiagnostics = $('#btn-confirm-diagnostics');
const diagnosticsStatus = $('#diagnostics-status');

// Navigation
const btnSettings = $('#btn-settings');
const btnBackSearch = $('#btn-back-search');
const btnBackMain = $('#btn-back-main');
const btnTestConnection = $('#btn-test-connection');
const btnSaveSettings = $('#btn-save-settings');

// ─── State ───────────────────────────────────────────────────────────────────

let currentFormData = null;
let searchDebounceTimer = null;

// ─── View Navigation ─────────────────────────────────────────────────────────

function showView(view) {
  [viewSearch, viewConfirm, viewSettings].forEach((v) => v.classList.remove('active'));
  view.classList.add('active');
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function setStatus(type, text) {
  statusBar.className = `status-bar status-${type}`;
  statusText.textContent = text;
}

// ─── Initialize ──────────────────────────────────────────────────────────────

async function initialize() {
  setStatus('idle', 'Checking connection…');

  // Test connection on popup open
  chrome.runtime.sendMessage({ action: 'TEST_CONNECTION' }, (result) => {
    if (chrome.runtime.lastError) {
      setStatus('error', 'Extension error. Reload the extension.');
      return;
    }
    if (result && result.connected) {
      setStatus('connected', 'Connected to GCDS');
    } else {
      setStatus('error', result?.message || 'Not connected');
    }
  });

  // Load settings into the form
  chrome.runtime.sendMessage({ action: 'GET_SETTINGS' }, (settings) => {
    if (settings) {
      settingsApiUrl.value = settings.apiUrl || '';
      settingsToken.value = settings.authToken || '';
    }
  });

  // Focus search input
  setTimeout(() => searchInput.focus(), 100);
}

// ─── Search Logic ────────────────────────────────────────────────────────────

function handleSearchInput() {
  const query = searchInput.value.trim();

  // Show/hide clear button
  btnClearSearch.style.display = query.length > 0 ? 'flex' : 'none';

  // Clear results if query too short
  if (query.length < 2) {
    searchResults.innerHTML = '';
    searchEmpty.style.display = 'none';
    searchLoading.style.display = 'none';
    searchInitial.style.display = query.length === 0 ? 'flex' : 'none';
    return;
  }

  searchInitial.style.display = 'none';

  // Debounce: wait 350ms after last keystroke
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => executeSearch(query), 350);
}

function executeSearch(query) {
  // Show loading
  searchResults.innerHTML = '';
  searchEmpty.style.display = 'none';
  searchLoading.style.display = 'flex';

  chrome.runtime.sendMessage(
    { action: 'SEARCH_CUSTOMERS', payload: { query } },
    (result) => {
      searchLoading.style.display = 'none';

      if (chrome.runtime.lastError) {
        showSearchError('Extension communication error.');
        return;
      }

      if (!result || !result.ok) {
        showSearchError(result?.error || 'Search failed.');
        return;
      }

      const customers = result.data;

      if (!Array.isArray(customers) || customers.length === 0) {
        searchEmpty.style.display = 'flex';
        return;
      }

      renderSearchResults(customers);
    }
  );
}

function showSearchError(message) {
  searchResults.innerHTML = `
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" stroke-width="1.5" stroke-linecap="round" opacity="0.6">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <p style="color: var(--accent-error)">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderSearchResults(customers) {
  searchResults.innerHTML = customers
    .map(
      (c) => `
    <div class="result-item" data-customer-id="${escapeHtml(c.id)}" tabindex="0" role="button" aria-label="Select customer ${escapeHtml(c.name)}">
      <div class="result-avatar">${getInitials(c.name)}</div>
      <div class="result-info">
        <div class="result-name">${escapeHtml(c.name)}</div>
        <div class="result-meta">
          <span class="result-code">${escapeHtml(c.customerCode || '')}</span>
          <span>${escapeHtml(c.mobileMasked || '')}</span>
        </div>
      </div>
      <svg class="result-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  `
    )
    .join('');

  // Attach click handlers
  searchResults.querySelectorAll('.result-item').forEach((item) => {
    item.addEventListener('click', () => selectCustomer(item.dataset.customerId));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectCustomer(item.dataset.customerId);
      }
    });
  });
}

// ─── Customer Selection & Confirmation ───────────────────────────────────────

async function selectCustomer(customerId) {
  // Show confirm view with loading state
  showView(viewConfirm);
  confirmName.textContent = 'Loading…';
  confirmCode.textContent = '';
  btnFillForm.disabled = true;
  fillStatus.style.display = 'none';

  chrome.runtime.sendMessage(
    { action: 'GET_FORM_FILL_DATA', payload: { customerId } },
    (result) => {
      if (chrome.runtime.lastError) {
        confirmName.textContent = 'Error';
        confirmCode.textContent = 'Could not retrieve customer data.';
        return;
      }

      if (!result || !result.ok) {
        confirmName.textContent = 'Error';
        confirmCode.textContent = result?.error || 'Failed to load customer.';
        return;
      }

      currentFormData = result.data;
      populateConfirmation(currentFormData);
      btnFillForm.disabled = false;
    }
  );
}

function populateConfirmation(data) {
  const name = data.name || {};
  const addr = data.address || {};
  const electoral = data.electoral || {};
  const relative = data.relative || {};

  confirmAvatar.textContent = getInitials(name.fullName || '');
  confirmName.textContent = name.fullName || '—';
  confirmCode.textContent = data.customerCode || '—';
  confirmPhone.textContent = data.mobile || '—';
  confirmDob.textContent = formatDate(data.dateOfBirth);
  confirmGender.textContent = capitalizeFirst(data.gender) || '—';

  // Build address string
  const addressParts = [
    addr.streetAddress,
    addr.cityTownVillage,
    addr.postOffice ? `PO: ${addr.postOffice}` : null,
    addr.district,
    addr.state,
    addr.pincode,
  ].filter(Boolean);
  confirmAddress.textContent = addressParts.join(', ') || '—';

  confirmEpic.textContent = data.epic || '—';

  // Assembly Constituency
  const acParts = [
    electoral.assemblyConstituencyNumber ? `#${electoral.assemblyConstituencyNumber}` : null,
    electoral.assemblyConstituencyName,
  ].filter(Boolean);
  confirmAC.textContent = acParts.join(' — ') || '—';

  // Electoral status
  const statusMap = {
    verified: '✅ Verified',
    unverified: '⏳ Unverified',
    pending: '🔄 Pending',
    failed: '❌ Failed',
  };
  confirmElectoralStatus.textContent =
    statusMap[electoral.verificationStatus] || electoral.verificationStatus || '—';
}

// ─── Fill Form ───────────────────────────────────────────────────────────────

function handleFillForm() {
  if (!currentFormData) return;

  btnFillForm.disabled = true;
  fillStatus.style.display = 'none';

  chrome.runtime.sendMessage(
    {
      action: 'INJECT_AND_FILL',
      payload: { formData: currentFormData },
    },
    (result) => {
      btnFillForm.disabled = false;

      if (chrome.runtime.lastError) {
        showFillStatus('error', '❌', 'Extension error. Please try again.');
        return;
      }

      if (!result) {
        showFillStatus('error', '❌', 'No response from content script.');
        return;
      }

      if (result.success) {
        const filled = result.filledCount || 0;
        const skipped = result.skippedCount || 0;
        const skippedFields = result.skippedFields || [];
        let message = `✅ ${filled} field(s) filled successfully.`;
        if (skipped > 0) {
          const preview = skippedFields.slice(0, 3).join(', ');
          const more = skippedFields.length > 3 ? ` +${skippedFields.length - 3} more` : '';
          message += ` ${skipped} skipped (${preview}${more}).`;
        }
        showFillStatus(skipped > 0 ? 'warning' : 'success', '', message);
      } else {
        showFillStatus('error', '❌', result.error || 'Fill failed.');
      }
    }
  );
}

function showFillStatus(type, icon, message) {
  fillStatus.style.display = 'flex';
  fillStatus.className = `fill-status ${type}`;
  fillStatusIcon.textContent = icon;
  fillStatusText.textContent = message;
}

// ─── Settings ────────────────────────────────────────────────────────────────

function handleSaveSettings() {
  const apiUrl = settingsApiUrl.value.trim();
  const token = settingsToken.value.trim();

  if (!apiUrl) {
    showSettingsStatus('error', 'API URL is required.');
    return;
  }

  if (!token) {
    showSettingsStatus('error', 'Pairing token is required.');
    return;
  }

  // Validate token format
  if (!token.startsWith('gcds_ext_') || token.length !== 73) {
    showSettingsStatus(
      'error',
      'Token must start with gcds_ext_ and be 73 characters long.'
    );
    return;
  }

  chrome.runtime.sendMessage(
    {
      action: 'SAVE_SETTINGS',
      payload: { apiUrl, authToken: token },
    },
    () => {
      showSettingsStatus('success', 'Settings saved. Testing connection…');

      // Auto-test after saving
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'TEST_CONNECTION' }, (result) => {
          if (result && result.connected) {
            showSettingsStatus('success', '✅ Connected to GCDS successfully!');
            setStatus('connected', 'Connected to GCDS');
          } else {
            showSettingsStatus('error', `❌ ${result?.message || 'Connection failed.'}`);
            setStatus('error', result?.message || 'Not connected');
          }
        });
      }, 300);
    }
  );
}

function handleTestConnection() {
  showSettingsStatus('success', '🔄 Testing connection…');

  chrome.runtime.sendMessage({ action: 'TEST_CONNECTION' }, (result) => {
    if (chrome.runtime.lastError) {
      showSettingsStatus('error', 'Extension error.');
      return;
    }
    if (result && result.connected) {
      showSettingsStatus('success', '✅ Connected to GCDS successfully!');
      setStatus('connected', 'Connected to GCDS');
    } else {
      showSettingsStatus('error', `❌ ${result?.message || 'Connection failed.'}`);
      setStatus('error', result?.message || 'Not connected');
    }
  });
}

function handleToggleToken() {
  const isPassword = settingsToken.type === 'password';
  settingsToken.type = isPassword ? 'text' : 'password';
  iconEye.style.display = isPassword ? 'none' : 'block';
  iconEyeOff.style.display = isPassword ? 'block' : 'none';
}

function showSettingsStatus(type, message) {
  settingsStatus.style.display = 'block';
  settingsStatus.className = `settings-status ${type}`;
  settingsStatus.textContent = message;
}

// ─── Utility Functions ───────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

async function handleCopyDiagnostics() {
  const showDiagStatus = (msg, isErr = false) => {
    if (diagnosticsStatus) {
      diagnosticsStatus.style.display = 'block';
      diagnosticsStatus.className = `settings-status ${isErr ? 'error' : 'success'}`;
      diagnosticsStatus.textContent = msg;
    }
  };

  showDiagStatus('Generating diagnostic report…');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id) {
      showDiagStatus('❌ No active tab found.', true);
      return;
    }

    if (!tab.url || !tab.url.includes('voters.eci.gov.in')) {
      const fallbackReport = {
        reportType: 'GCDS_PRIVACY_SAFE_DIAGNOSTIC',
        version: '1.1.0',
        timestamp: new Date().toISOString(),
        portal: {
          url: tab.url ? tab.url.split('?')[0].split('#')[0] : 'non-eci-page',
          note: 'Active tab is not voters.eci.gov.in',
        },
        safetyDeclaration: 'Zero personal data (PII) included.',
      };
      await navigator.clipboard.writeText(JSON.stringify(fallbackReport, null, 2));
      showDiagStatus('⚠️ Active tab is not ECI portal. Basic report copied.');
      return;
    }

    // Ensure content script is injected into active tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
    } catch {}

    chrome.tabs.sendMessage(tab.id, { action: 'GET_DIAGNOSTIC_REPORT' }, async (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showDiagStatus(`❌ Failed to retrieve diagnostics: ${chrome.runtime.lastError?.message || response?.error || 'Unknown error'}`, true);
        return;
      }
      try {
        await navigator.clipboard.writeText(JSON.stringify(response.report, null, 2));
        showDiagStatus('✅ Copied privacy-safe diagnostic report to clipboard!');
      } catch (clipErr) {
        showDiagStatus(`❌ Clipboard error: ${clipErr.message}`, true);
      }
    });
  } catch (err) {
    showDiagStatus(`❌ Error: ${err.message}`, true);
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

// Navigation
btnSettings.addEventListener('click', () => showView(viewSettings));
btnBackSearch.addEventListener('click', () => showView(viewSearch));
btnBackMain.addEventListener('click', () => showView(viewSearch));

// Search
searchInput.addEventListener('input', handleSearchInput);
btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  handleSearchInput();
  searchInput.focus();
});

// Fill
btnFillForm.addEventListener('click', handleFillForm);

// Settings
btnSaveSettings.addEventListener('click', handleSaveSettings);
btnTestConnection.addEventListener('click', handleTestConnection);
btnToggleToken.addEventListener('click', handleToggleToken);

// Diagnostics
if (btnCopyDiagnostics) {
  btnCopyDiagnostics.addEventListener('click', handleCopyDiagnostics);
}
if (btnConfirmDiagnostics) {
  btnConfirmDiagnostics.addEventListener('click', async () => {
    await handleCopyDiagnostics();
    if (fillStatus && fillStatusText) {
      fillStatus.style.display = 'flex';
      fillStatus.className = 'fill-status';
      fillStatusText.textContent = 'Diagnostic report copied to clipboard. Share with tech support.';
    }
  });
}

// Session timeout broadcast listener
if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'SESSION_EXPIRED') {
      setStatus('error', `Session expired (${msg.timeoutMinutes || 30}m inactive).`);
      showView(viewSearch);
    }
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────

initialize();
