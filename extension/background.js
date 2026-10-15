/**
 * GCDS Smart Form Filler — Background Service Worker
 * File: extension/background.js
 *
 * Handles persistent session state management, GCDS API communication,
 * and message routing between popup and content scripts.
 *
 * Security Invariants:
 * - PII (Aadhaar, PAN) is NEVER logged to console.
 * - Plaintext pairing tokens are stored only in chrome.storage.local (encrypted at rest by Chrome).
 * - All API requests use Bearer token authentication.
 */

// ─── Default Configuration ───────────────────────────────────────────────────

const DEFAULT_API_URL = 'https://gdsa-opal.vercel.app';
const SEARCH_ENDPOINT = '/api/extension/customers/search';
const FORM_FILL_ENDPOINT = '/api/extension/customers'; // /{id}/form-fill
const EXTENSION_VERSION = '1.2.2';

// Inactivity security timeout for multi-operator kiosk protection
const INACTIVITY_TIMEOUT_MINUTES = 30;
const INACTIVITY_TIMEOUT_MS = INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
const INACTIVITY_ALARM_NAME = 'GCDS_SESSION_INACTIVITY_TIMEOUT';

// ─── Session Security & Inactivity Timeout ───────────────────────────────────

/**
 * Resets the 30-minute inactivity timer.
 * Stores last_activity timestamp in chrome.storage.session and chrome.storage.local,
 * and sets/resets the background chrome.alarms schedule.
 */
async function recordActivityAndResetTimer() {
  const now = Date.now();
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.set({ last_activity: now });
    }
  } catch {}

  await new Promise((resolve) => {
    chrome.storage.local.set({ gcds_last_activity: now }, resolve);
  });

  if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.create(INACTIVITY_ALARM_NAME, {
      delayInMinutes: INACTIVITY_TIMEOUT_MINUTES,
    });
  }
}

/**
 * Checks if the operator session has exceeded the 30-minute inactivity threshold.
 * @returns {Promise<boolean>}
 */
async function isSessionExpired() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['gcds_last_activity', 'gcds_auth_token'], (res) => {
      // If no token exists, session is inactive
      if (!res.gcds_auth_token) {
        resolve(false);
        return;
      }
      const lastActivity = res.gcds_last_activity;
      if (!lastActivity) {
        // Initial activity
        resolve(false);
        return;
      }
      const elapsedMs = Date.now() - lastActivity;
      resolve(elapsedMs > INACTIVITY_TIMEOUT_MS);
    });
  });
}

/**
 * Purges customer data and pairing credentials from session upon 30-minute inactivity timeout.
 */
async function handleSessionTimeout() {
  console.warn(`[GCDS Security] Inactivity timeout (${INACTIVITY_TIMEOUT_MINUTES}m) reached. Purging active customer and pairing credentials.`);

  // 1. Clear chrome.storage.session (in-memory per browser session)
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.clear();
    }
  } catch (err) {
    console.warn('[GCDS Security] chrome.storage.session clear failed:', err);
  }

  // 2. Clear sensitive session items in chrome.storage.local
  await new Promise((resolve) => {
    chrome.storage.local.remove([
      'activeCustomer',
      'gcds_active_customer',
      'gcds_auth_token',
      'gcds_last_activity',
      'current_form_data',
    ], resolve);
  });

  // 3. Clear alarm
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.clear(INACTIVITY_ALARM_NAME);
  }

  // 4. Notify any open extension views
  try {
    chrome.runtime.sendMessage({
      action: 'SESSION_EXPIRED',
      reason: 'INACTIVITY_TIMEOUT',
      timeoutMinutes: INACTIVITY_TIMEOUT_MINUTES,
    }).catch(() => {});
  } catch {}
}

// Register background alarm listener
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === INACTIVITY_ALARM_NAME) {
      handleSessionTimeout();
    }
  });
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────

/**
 * Retrieves GCDS connection settings from chrome.storage.local.
 * @returns {{ apiUrl: string, authToken: string }}
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['gcds_api_url', 'gcds_auth_token'], (result) => {
      resolve({
        apiUrl: (result.gcds_api_url || DEFAULT_API_URL).replace(/\/+$/, ''),
        authToken: result.gcds_auth_token || '',
      });
    });
  });
}

/**
 * Saves GCDS connection settings to chrome.storage.local.
 */
async function saveSettings(apiUrl, authToken) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        gcds_api_url: apiUrl.replace(/\/+$/, ''),
        gcds_auth_token: authToken,
      },
      resolve
    );
  });
}

// ─── API Client ──────────────────────────────────────────────────────────────

/**
 * Makes an authenticated GET request to the GCDS Extension API.
 * Includes retry logic for transient network failures.
 *
 * @param {string} path - The API path (e.g., /api/extension/customers/search?q=...)
 * @param {number} retries - Number of retry attempts (default: 2)
 * @returns {Promise<{ok: boolean, status: number, data: any, error?: string}>}
 */
async function apiGet(path, retries = 2) {
  const { apiUrl, authToken } = await getSettings();

  if (!authToken) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'No pairing token configured. Open Settings to connect to GCDS.',
    };
  }

  const url = `${apiUrl}${path}`;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'X-GCDS-Client': `gazi-smart-form-filler/${EXTENSION_VERSION}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data,
          error: data.error || `API error (${response.status})`,
        };
      }

      return { ok: true, status: response.status, data };
    } catch (err) {
      lastError = err;
      // Wait before retrying (exponential backoff: 500ms, 1000ms)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  return {
    ok: false,
    status: 0,
    data: null,
    error: `Network error: ${lastError?.message || 'Unable to reach GCDS server'}. Check your connection.`,
  };
}

// ─── API Actions ─────────────────────────────────────────────────────────────

/**
 * Searches GCDS customers by query string.
 * Returns minimal, privacy-hardened results (id, customerCode, name, maskedMobile).
 */
async function searchCustomers(query) {
  const encoded = encodeURIComponent(query.trim());
  return apiGet(`${SEARCH_ENDPOINT}?q=${encoded}`);
}

/**
 * Fetches the full form-fill DTO for a specific customer.
 * Excludes all sensitive PII (Aadhaar, PAN, GST, documents).
 */
async function getFormFillData(customerId) {
  return apiGet(`${FORM_FILL_ENDPOINT}/${customerId}/form-fill`);
}

/**
 * Tests connectivity and authentication against the GCDS API.
 * Uses a dummy search query to verify the token is valid.
 */
async function testConnection() {
  const result = await apiGet(`${SEARCH_ENDPOINT}?q=test`);
  if (result.ok) {
    return { connected: true, message: 'Connected to GCDS successfully.' };
  }

  // Map error codes to user-friendly messages
  const codeMessages = {
    MISSING_AUTHORIZATION: 'Token not provided.',
    MALFORMED_AUTHORIZATION_HEADER: 'Token format is incorrect.',
    INVALID_TOKEN_FORMAT: 'Token does not match gcds_ext_ format.',
    TOKEN_NOT_FOUND: 'Token not recognized. Check if it was copied correctly.',
    TOKEN_REVOKED: 'Token has been revoked. Generate a new one from GCDS.',
    TOKEN_EXPIRED: 'Token has expired. Generate a new one from GCDS.',
    INSUFFICIENT_SCOPE: 'Token lacks required permissions (customers:search).',
    INACTIVE_BUSINESS_MEMBERSHIP: 'Business membership is no longer active.',
  };

  const code = result.data?.code;
  const message = codeMessages[code] || result.error || 'Connection failed.';

  return { connected: false, message, code };
}

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  switch (action) {
    case 'SEARCH_CUSTOMERS':
      (async () => {
        if (await isSessionExpired()) {
          await handleSessionTimeout();
          sendResponse({
            ok: false,
            status: 401,
            error: 'Session expired due to 30 minutes of inactivity. Customer data purged.',
            code: 'SESSION_INACTIVITY_EXPIRED',
          });
          return;
        }
        await recordActivityAndResetTimer();
        const res = await searchCustomers(payload?.query || '');
        sendResponse(res);
      })();
      return true; // Async response

    case 'GET_FORM_FILL_DATA':
      (async () => {
        if (await isSessionExpired()) {
          await handleSessionTimeout();
          sendResponse({
            ok: false,
            status: 401,
            error: 'Session expired due to 30 minutes of inactivity. Customer data purged.',
            code: 'SESSION_INACTIVITY_EXPIRED',
          });
          return;
        }
        await recordActivityAndResetTimer();
        const res = await getFormFillData(payload?.customerId);
        sendResponse(res);
      })();
      return true;

    case 'TEST_CONNECTION':
      (async () => {
        await recordActivityAndResetTimer();
        const res = await testConnection();
        sendResponse(res);
      })();
      return true;

    case 'SAVE_SETTINGS':
      (async () => {
        await saveSettings(payload.apiUrl, payload.authToken);
        await recordActivityAndResetTimer();
        sendResponse({ success: true });
      })();
      return true;

    case 'GET_SETTINGS':
      getSettings().then(sendResponse);
      return true;

    case 'GET_SESSION_STATUS':
      (async () => {
        const expired = await isSessionExpired();
        chrome.storage.local.get(['gcds_last_activity', 'gcds_auth_token'], (res) => {
          const hasToken = Boolean(res.gcds_auth_token);
          const lastActivity = res.gcds_last_activity || 0;
          const elapsedMs = lastActivity ? Date.now() - lastActivity : 0;
          const remainingMinutes = Math.max(0, Math.round((INACTIVITY_TIMEOUT_MS - elapsedMs) / 60000));
          sendResponse({
            active: hasToken && !expired,
            expired,
            remainingMinutes: hasToken && !expired ? remainingMinutes : 0,
            timeoutMinutes: INACTIVITY_TIMEOUT_MINUTES,
            lastActivity,
          });
        });
      })();
      return true;

    case 'RESET_INACTIVITY_TIMER':
      recordActivityAndResetTimer().then(() => sendResponse({ success: true }));
      return true;

    case 'CLEAR_SESSION':
      handleSessionTimeout().then(() => sendResponse({ success: true }));
      return true;

    case 'TRANSLITERATE':
      transliterateText(payload?.text, payload?.lang || 'bn')
        .then((result) => sendResponse({ success: true, text: result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'FETCH_IMAGE_BLOB':
      (async () => {
        try {
          const rawUrl = message.url || payload?.url;
          const customerId = message.customerId || payload?.customerId;

          let fetchUrl = rawUrl;

          // If no direct URL provided, but customerId is available, resolve from GCDS photo API
          if (!fetchUrl && customerId) {
            const photoRes = await apiGet(`${FORM_FILL_ENDPOINT}/${customerId}/photo`);
            if (photoRes.ok && photoRes.data?.hasPhoto && photoRes.data?.photo?.dataUrl) {
              sendResponse({
                success: true,
                blobData: photoRes.data.photo.dataUrl,
                sizeBytes: photoRes.data.photo.sizeBytes,
                mimeType: photoRes.data.photo.mimeType || 'image/jpeg',
              });
              return;
            } else if (photoRes.ok && photoRes.data?.photo?.signedUrl) {
              fetchUrl = photoRes.data.photo.signedUrl;
            }
          }

          if (!fetchUrl) {
            sendResponse({ success: false, error: 'No image URL or customer ID provided' });
            return;
          }

          // If it is already a Data URL, return directly
          if (fetchUrl.startsWith('data:')) {
            sendResponse({ success: true, blobData: fetchUrl });
            return;
          }

          // Relative path resolution to GCDS API if needed
          const settings = await getSettings();
          if (fetchUrl.startsWith('/')) {
            fetchUrl = `${settings.apiUrl}${fetchUrl}`;
          }

          const fetchOptions = {};
          // If fetching from GCDS API, attach Bearer auth token
          if (settings.authToken && (fetchUrl.includes('/api/extension/') || fetchUrl.startsWith(settings.apiUrl))) {
            fetchOptions.headers = {
              Authorization: `Bearer ${settings.authToken}`,
            };
          }

          const res = await fetch(fetchUrl, fetchOptions);
          if (!res.ok) {
            sendResponse({ success: false, error: `Image fetch failed with HTTP ${res.status}` });
            return;
          }

          const blob = await res.blob();

          // Portal size constraint: maximum 2MB (.jpg, .jpeg)
          const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;
          if (blob.size > MAX_PHOTO_SIZE_BYTES) {
            sendResponse({
              success: false,
              error: `Customer photograph (${(blob.size / 1024 / 1024).toFixed(2)} MB) exceeds ECI maximum 2MB limit.`,
              sizeBytes: blob.size,
            });
            return;
          }

          // Convert blob to DataURL in MV3
          const arrayBuffer = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8.byteLength; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64 = btoa(binary);
          const mimeType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
          const blobData = `data:${mimeType};base64,${base64}`;

          sendResponse({
            success: true,
            blobData,
            sizeBytes: blob.size,
            mimeType,
          });
        } catch (err) {
          sendResponse({ success: false, error: err.message || 'Failed to fetch image blob' });
        }
      })();
      return true;

    case 'INJECT_AND_FILL':
      // Inject content script into the active ECI tab, then send fill data
      (async () => {
        try {
          if (await isSessionExpired()) {
            await handleSessionTimeout();
            sendResponse({
              success: false,
              error: 'Session expired due to 30 minutes of inactivity. Please re-select customer.',
              code: 'SESSION_INACTIVITY_EXPIRED',
            });
            return;
          }
          await recordActivityAndResetTimer();

          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tab = tabs[0];
          if (!tab || !tab.id) {
            sendResponse({ success: false, error: 'No active tab found.' });
            return;
          }

          // Check if this is an ECI tab
          if (!tab.url || !tab.url.includes('voters.eci.gov.in')) {
            sendResponse({
              success: false,
              error: 'Please navigate to the ECI Voters Portal (voters.eci.gov.in) first.',
            });
            return;
          }

          const formData = payload.formData || {};

          // Auto-transliterate relative names if regional script is missing
          if (formData.relative) {
            let targetLang = 'bn';
            const stateStr = String(formData.address?.state || '').toLowerCase();
            if (stateStr.includes('bihar') || stateStr.includes('uttar') || stateStr.includes('delhi') || stateStr.includes('madhya') || stateStr.includes('rajasthan')) {
              targetLang = 'hi';
            } else if (stateStr.includes('tamil')) {
              targetLang = 'ta';
            } else if (stateStr.includes('telangana') || stateStr.includes('andhra')) {
              targetLang = 'te';
            } else if (stateStr.includes('karnataka')) {
              targetLang = 'kn';
            } else if (stateStr.includes('kerala')) {
              targetLang = 'ml';
            } else if (stateStr.includes('maharashtra')) {
              targetLang = 'mr';
            } else if (stateStr.includes('gujarat')) {
              targetLang = 'gu';
            } else if (stateStr.includes('odisha') || stateStr.includes('orissa')) {
              targetLang = 'or';
            } else if (stateStr.includes('punjab')) {
              targetLang = 'pa';
            }

            // Pre-transliterate relative names (Father, Mother, Spouse) if regional script is missing
            const splitNameSafe = (firstMiddle, last, full) => {
              let f = String(firstMiddle || '').trim();
              let l = String(last || '').trim();
              if (!f && full) {
                const parts = String(full).trim().split(/\s+/);
                if (parts.length > 1) {
                  f = parts.slice(0, -1).join(' ');
                  l = parts[parts.length - 1];
                } else {
                  f = parts[0];
                }
              }
              return { first: f, last: l };
            };

            // 1. Father
            const fName = splitNameSafe(
              formData.relative.father_first_name || formData.relative.fatherFirstMiddleName,
              formData.relative.father_last_name || formData.relative.fatherSurname,
              formData.relative.fatherName || formData.father_name
            );
            if (!formData.relative.fatherRegionalFirstName && fName.first) {
              formData.relative.fatherRegionalFirstName = await transliterateText(fName.first, targetLang);
            }
            if (!formData.relative.fatherRegionalLastName && fName.last) {
              formData.relative.fatherRegionalLastName = await transliterateText(fName.last, targetLang);
            }

            // 2. Mother
            const mName = splitNameSafe(
              formData.relative.mother_first_name || formData.relative.motherFirstMiddleName,
              formData.relative.mother_last_name || formData.relative.motherSurname,
              formData.relative.motherName || formData.mother_name
            );
            if (!formData.relative.motherRegionalFirstName && mName.first) {
              formData.relative.motherRegionalFirstName = await transliterateText(mName.first, targetLang);
            }
            if (!formData.relative.motherRegionalLastName && mName.last) {
              formData.relative.motherRegionalLastName = await transliterateText(mName.last, targetLang);
            }

            // 3. Spouse
            const sName = splitNameSafe(
              formData.relative.spouse_first_name || formData.relative.spouseFirstMiddleName,
              formData.relative.spouse_last_name || formData.relative.spouseSurname,
              formData.relative.spouseName || formData.spouse_name
            );
            if (!formData.relative.spouseRegionalFirstName && sName.first) {
              formData.relative.spouseRegionalFirstName = await transliterateText(sName.first, targetLang);
            }
            if (!formData.relative.spouseRegionalLastName && sName.last) {
              formData.relative.spouseRegionalLastName = await transliterateText(sName.last, targetLang);
            }

            // Fallback default relative regional names (backward compatibility)
            if (!formData.relative.regionalFirstName) {
              formData.relative.regionalFirstName =
                formData.relative.fatherRegionalFirstName ||
                formData.relative.motherRegionalFirstName ||
                formData.relative.spouseRegionalFirstName || '';
            }
            if (!formData.relative.regionalLastName) {
              formData.relative.regionalLastName =
                formData.relative.fatherRegionalLastName ||
                formData.relative.motherRegionalLastName ||
                formData.relative.spouseRegionalLastName || '';
            }
          }

          // Inject the content script
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });

          // Send the form data to the content script
          chrome.tabs.sendMessage(
            tab.id,
            { action: 'FILL_FORM', payload: formData },
            (response) => {
              sendResponse(response || { success: false, error: 'Content script did not respond.' });
            }
          );
        } catch (err) {
          sendResponse({
            success: false,
            error: `Injection error: ${err.message}`,
          });
        }
      })();
      return true;

    default:
      sendResponse({ error: `Unknown action: ${action}` });
      return false;
  }
});

/**
 * Transliterates Latin/English text into the regional Indian language script
 * using the Google Input Tools public API (unauthenticated).
 */
async function transliterateText(text, targetLang = 'bn') {
  if (!text || !text.trim()) return '';
  // If already non-ASCII (e.g. Bengali, Hindi), return as is
  if (/[^\u0000-\u007F]/.test(text)) return text.trim();

  const langPrefix = (targetLang || 'bn').split('_')[0].toLowerCase();
  if (langPrefix === 'en') return text.trim();

  try {
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text.trim())}&itc=${langPrefix}-t-i0-und&num=1`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data[0] === 'SUCCESS' && data[1]?.[0]?.[1]?.[0]) {
        return data[1][0][1][0];
      }
    }
  } catch (err) {
    // Non-blocking fallback
  }
  return '';
}

// ─── Installation Handler ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default API URL on first install
    chrome.storage.local.set({ gcds_api_url: DEFAULT_API_URL });
  }
});
