/**
 * Google Analytics 4 Integration for Chrome Extension
 * Uses Measurement Protocol API to bypass CSP restrictions
 * 
 * NOTE: Analytics is currently disabled. To enable:
 * 1. Replace GA_MEASUREMENT_ID with your actual GA4 Measurement ID
 * 2. Replace GA_API_SECRET with your Measurement Protocol API secret
 * 3. See ANALYTICS_SETUP.md for full setup instructions
 */

// ============================================
// CONFIGURATION
// ============================================

const GA_MEASUREMENT_ID = 'G-8TX6XHQ2X1'; // PLACEHOLDER - Replace with your GA4 Measurement ID
const GA_API_SECRET = 'hpg6paT_QjapqiR7l1oaOA';   // PLACEHOLDER - Replace with your Measurement Protocol API secret
const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

// Debug mode (sends to debug endpoint)
const DEBUG_MODE = true;
const DEBUG_ENDPOINT = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

// ============================================
// CLIENT ID MANAGEMENT
// ============================================

let clientId = null;

async function getClientId() {
  if (clientId) return clientId;
  
  try {
    const data = await chrome.storage.local.get('ga_client_id');
    
    if (data.ga_client_id) {
      clientId = data.ga_client_id;
    } else {
      // Generate new client ID (UUID v4 format)
      clientId = crypto.randomUUID();
      await chrome.storage.local.set({ ga_client_id: clientId });
    }
    
    return clientId;
  } catch (error) {
    console.error('[Analytics] Error getting client ID:', error);
    return 'error-client-id';
  }
}

// ============================================
// SESSION MANAGEMENT
// ============================================

let sessionId = null;
let sessionStart = null;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function getSessionId() {
  const now = Date.now();
  
  // Create new session if none exists or session expired
  if (!sessionId || !sessionStart || (now - sessionStart > SESSION_TIMEOUT)) {
    sessionId = now.toString();
    sessionStart = now;
  }
  
  return sessionId;
}

// ============================================
// EVENT TRACKING
// ============================================

/**
 * Send event to Google Analytics
 * @param {string} eventName - Name of the event
 * @param {object} eventParams - Event parameters
 */
async function trackEvent(eventName, eventParams = {}) {
  try {
    const cid = await getClientId();
    const sid = getSessionId();
    
    const payload = {
      client_id: cid,
      events: [{
        name: eventName,
        params: {
          session_id: sid,
          engagement_time_msec: 100,
          ...eventParams
        }
      }]
    };
    
    const endpoint = DEBUG_MODE ? DEBUG_ENDPOINT : GA_ENDPOINT;
    
    if (DEBUG_MODE) {
      console.log('[Analytics] Tracking event:', eventName, eventParams);
    }
    
    await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
  } catch (error) {
    console.error('[Analytics] Error tracking event:', error);
  }
}

/**
 * Track page view
 * @param {string} pageTitle - Title of the page
 * @param {string} pageLocation - URL or path of the page
 */
async function trackPageView(pageTitle, pageLocation) {
  await trackEvent('page_view', {
    page_title: pageTitle,
    page_location: pageLocation
  });
}

/**
 * Track timer started
 * @param {number} duration - Timer duration in seconds
 * @param {string} source - Source of timer (preset, custom, main_clock)
 */
async function trackTimerStart(duration, source = 'unknown') {
  await trackEvent('timer_start', {
    timer_duration: duration,
    timer_source: source
  });
}

/**
 * Track timer completed
 * @param {number} duration - Timer duration in seconds
 */
async function trackTimerComplete(duration) {
  await trackEvent('timer_complete', {
    timer_duration: duration
  });
}

/**
 * Track timer stopped
 * @param {number} elapsed - Time elapsed before stop in seconds
 * @param {number} remaining - Time remaining in seconds
 */
async function trackTimerStop(elapsed, remaining) {
  await trackEvent('timer_stop', {
    elapsed_time: elapsed,
    remaining_time: remaining
  });
}

/**
 * Track settings changed
 * @param {string} settingName - Name of the setting changed
 * @param {any} value - New value
 */
async function trackSettingChange(settingName, value) {
  await trackEvent('setting_change', {
    setting_name: settingName,
    setting_value: String(value)
  });
}

/**
 * Track platform usage
 * @param {string} platform - Streaming platform name
 */
async function trackPlatform(platform) {
  await trackEvent('platform_use', {
    platform_name: platform
  });
}

/**
 * Track errors
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 */
async function trackError(errorType, errorMessage) {
  await trackEvent('error', {
    error_type: errorType,
    error_message: errorMessage
  });
}

// ============================================
// EXPORTS
// ============================================

export {
  trackEvent,
  trackPageView,
  trackTimerStart,
  trackTimerComplete,
  trackTimerStop,
  trackSettingChange,
  trackPlatform,
  trackError
};
