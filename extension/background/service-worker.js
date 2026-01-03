import { ConfigManager } from '../utils/config-manager.js';
import { timerEngine } from './timer-engine.js';
import { formatSecondsToDisplay } from '../utils/time-utils.js';
import { AUTOPLAY_CONFIG } from '../utils/config.js';
import { trackTimerStart, trackTimerComplete, trackTimerStop } from '../utils/analytics.js';

// ============================================
// CONFIGURATION CONSTANTS
// ============================================

const SERVICE_WORKER_CONFIG = {
  // Default timer presets (in seconds) - imported from config
  DEFAULT_PRESETS: AUTOPLAY_CONFIG.defaultPresets,
  
  // Validation limits
  VALIDATION: {
    MAX_MINUTES: 1440,      // 24 hours
    MAX_SECONDS: 86400,     // 24 hours
    MIN_VALUE: 0
  },
  
  // Context menu configuration
  CONTEXT_MENU: {
    MAX_RETRIES: 3,
    RETRY_BASE_DELAY: 1000  // 1 second (exponential backoff)
  }
};

// ============================================
// INSTALLATION & STARTUP
// ============================================

// Default presets in seconds
const DEFAULT_PRESETS = SERVICE_WORKER_CONFIG.DEFAULT_PRESETS;

// Create context menu items with retry logic
async function createContextMenus(retryCount = 0) {
  try {
    // Remove existing menus first
    await chrome.contextMenus.removeAll();
    
    // Create parent menu
    chrome.contextMenus.create({
      id: 'autoplay-parent',
      title: '⏱️ Set Timer',
      contexts: ['page', 'video']
    });
  
  // Get user's custom presets or use defaults
  const result = await chrome.storage.local.get('timerPresets');
  const presets = result.timerPresets || DEFAULT_PRESETS;
  
  // Create menu items for each preset
  presets.forEach((seconds, index) => {
    chrome.contextMenus.create({
      id: `autoplay-preset-${index}`,
      parentId: 'autoplay-parent',
      title: formatSecondsToDisplay(seconds),
      contexts: ['page', 'video']
    });
  });
  
  // Add separator
  chrome.contextMenus.create({
    id: 'autoplay-separator',
    parentId: 'autoplay-parent',
    type: 'separator',
    contexts: ['page', 'video']
  });
  
  // Add custom duration option
  chrome.contextMenus.create({
    id: 'autoplay-custom',
    parentId: 'autoplay-parent',
    title: '⚙️ Custom Duration...',
    contexts: ['page', 'video']
  });
  } catch (error) {
    console.error('[AutoPlay] Context menu creation error:', error.message);
    
    // Retry with exponential backoff (using configured limits)
    if (retryCount < SERVICE_WORKER_CONFIG.CONTEXT_MENU.MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * SERVICE_WORKER_CONFIG.CONTEXT_MENU.RETRY_BASE_DELAY;
      console.log(`[AutoPlay] Retrying context menu creation in ${delay}ms (attempt ${retryCount + 1}/${SERVICE_WORKER_CONFIG.CONTEXT_MENU.MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return createContextMenus(retryCount + 1);
    }
    
    console.error(`[AutoPlay] Failed to create context menus after ${SERVICE_WORKER_CONFIG.CONTEXT_MENU.MAX_RETRIES} attempts`);
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.toString().startsWith('autoplay-')) return;
  
  const menuId = info.menuItemId.toString();
  
  if (menuId === 'autoplay-custom') {
    // Inject prompt for custom duration
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (window.showCustomTimerPrompt) {
            window.showCustomTimerPrompt();
          } else {
            const duration = prompt('Enter timer duration (e.g., 30s, 5m, 1h 30m):');
            if (duration) {
              chrome.runtime.sendMessage({ action: 'startTimer', duration: duration });
            }
          }
        }
      });
    } catch (error) {
      console.error('[AutoPlay] Failed to show custom prompt:', error);
    }
    return;
  }
  
  if (menuId.startsWith('autoplay-preset-')) {
    const index = parseInt(menuId.replace('autoplay-preset-', ''), 10);
    const result = await chrome.storage.local.get('timerPresets');
    const presets = result.timerPresets || DEFAULT_PRESETS;
    const seconds = presets[index];
    
    if (seconds) {
      const minutes = seconds / 60;
      await timerEngine.startTimer(minutes, tab.id);
      
      // Show notification
      const settings = (await chrome.storage.local.get('settings')).settings || {};
      if (settings.showNotifications !== false) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icons/android-chrome-192x192.png'),
          title: 'Viboot Timer Started',
          message: `Timer set for ${formatSecondsToDisplay(seconds)}`
        });
      }
    }
  }
});

// Run immediately when extension is installed/updated
chrome.runtime.onInstalled.addListener(async () => {
  try {
    console.log("[AutoPlay] Extension installed. Starting initial setup...");
    
    // Create context menus
    await createContextMenus();
    
    // Sync remote config (non-blocking)
    ConfigManager.syncConfig().catch(e => 
      console.warn('[AutoPlay] Initial config sync failed:', e.message)
    );
    
    // Schedule daily config sync (every 24 hours)
    await chrome.alarms.create('dailyConfigSync', { periodInMinutes: 1440 });
    
    console.log("[AutoPlay] Setup complete.");
  } catch (error) {
    console.error('[AutoPlay] Installation error:', error);
  }
});

// Restore timer when service worker starts (browser restart)
chrome.runtime.onStartup.addListener(async () => {
  console.log("[AutoPlay] Browser started. Checking for active timer...");
  await timerEngine.restoreTimer();
  
  // Proactive config refresh check on startup
  const needsSync = await ConfigManager.needsRefresh();
  if (needsSync) {
    console.log('[AutoPlay] Config is stale, triggering sync...');
    ConfigManager.syncConfig().catch(e => 
      console.warn('[AutoPlay] Startup config sync failed:', e.message)
    );
  }
});

// ============================================
// ALARMS (Scheduled Tasks)
// ============================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === 'dailyConfigSync') {
      console.log("[AutoPlay] Running daily config sync...");
      await ConfigManager.syncConfig();
    } else if (alarm.name.startsWith('autoplay')) {
      // Handle timer alarms (autoplayTimerTick, autoplayTimerExpiry)
      await timerEngine.handleAlarm(alarm.name);
    }
  } catch (error) {
    console.error('[AutoPlay] Alarm handler error:', error);
  }
});

// ============================================
// MESSAGE HANDLING (Popup & Content Scripts)
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is from this extension
  if (!sender.id || sender.id !== chrome.runtime.id) {
    console.warn('[AutoPlay] Rejected message from invalid sender:', sender);
    sendResponse({ success: false, error: 'Invalid sender' });
    return;
  }
  
  // Validate message structure
  if (!message || typeof message !== 'object' || !message.action || typeof message.action !== 'string') {
    console.warn('[AutoPlay] Rejected invalid message format');
    sendResponse({ success: false, error: 'Invalid message format' });
    return;
  }
  
  // Handle async operations
  handleMessage(message, sender)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  // Return true to indicate async response
  return true;
});

// Allowlist of valid actions for security
const ALLOWED_ACTIONS = new Set([
  'startTimer',
  'stopTimer',
  'extendTimer',
  'pauseTimer',
  'resumeTimer',
  'getTimerStatus',
  'syncConfig',
  'getSelectors',
  'getSettings',
  'saveSettings',
  'refreshContextMenus'
]);

/**
 * Validate a parameter with type and range checking
 * @param {*} value - The value to validate
 * @param {string} name - Parameter name for error messages
 * @param {string} type - Expected type ('number', 'string', etc.)
 * @param {Object} options - Validation options (min, max, required)
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateParameter(value, name, type, options = {}) {
  // Check if value is provided
  if (value === undefined || value === null) {
    if (options.required) {
      return { valid: false, error: `Missing required parameter: ${name}` };
    }
    return { valid: true, error: null };
  }
  
  // Type validation
  if (typeof value !== type) {
    return { valid: false, error: `Invalid ${name} type (expected ${type}, got ${typeof value})` };
  }
  
  // Number range validation
  if (type === 'number') {
    if (options.min !== undefined && value < options.min) {
      return { valid: false, error: `${name} must be >= ${options.min}` };
    }
    if (options.max !== undefined && value > options.max) {
      return { valid: false, error: `${name} must be <= ${options.max}` };
    }
  }
  
  return { valid: true, error: null };
}

async function handleMessage(message, sender) {
  const { action } = message;
  
  // Validate action is allowed
  if (!ALLOWED_ACTIONS.has(action)) {
    return { success: false, error: `Unknown action: ${action}` };
  }
  
  switch (action) {
    // ---- Timer Controls ----
    case 'startTimer': {
      // Validate parameters using helper
      const minutesCheck = validateParameter(message.minutes, 'minutes', 'number', { 
        min: SERVICE_WORKER_CONFIG.VALIDATION.MIN_VALUE, 
        max: SERVICE_WORKER_CONFIG.VALIDATION.MAX_MINUTES 
      });
      if (!minutesCheck.valid) return { success: false, error: minutesCheck.error };
      
      const durationCheck = validateParameter(message.duration, 'duration', 'number', { 
        min: SERVICE_WORKER_CONFIG.VALIDATION.MIN_VALUE, 
        max: SERVICE_WORKER_CONFIG.VALIDATION.MAX_SECONDS 
      });
      if (!durationCheck.valid) return { success: false, error: durationCheck.error };
      
      const tabIdCheck = validateParameter(message.tabId, 'tabId', 'number', { min: 1 });
      if (!tabIdCheck.valid) return { success: false, error: tabIdCheck.error };
      
      // Support both 'minutes' and 'duration' (seconds) for custom timer
      let minutes = message.minutes;
      if (!minutes && message.duration) {
        minutes = message.duration / 60; // Convert seconds to minutes
      }
      // Get tabId from message or sender
      const tabId = message.tabId || sender?.tab?.id;
      
      if (!tabId) {
        // Get the active tab if no tabId provided
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          const timer = await timerEngine.startTimer(minutes, activeTab.id);
          
          // Track analytics
          trackTimerStart(minutes * 60, request.source || 'popup').catch(() => {});
          
          return { success: true, timer };
        }
        return { success: false, error: 'No active tab found' };
      }
      
      const timer = await timerEngine.startTimer(minutes, tabId);
      
      // Track analytics
      trackTimerStart(minutes * 60, 'context_menu').catch(() => {});
      
      return { success: true, timer };
    }
    
    case 'stopTimer': {
      const activeTimer = timerEngine.activeTimer;
      await timerEngine.stopTimer();
      
      // Track analytics if timer was active
      if (activeTimer) {
        const elapsed = activeTimer.duration - activeTimer.remaining;
        trackTimerStop(elapsed, activeTimer.remaining).catch(() => {});
      }
      
      return { success: true };
    }
    
    case 'extendTimer': {
      const { minutes } = message;
      // Validate using helper
      const minutesCheck = validateParameter(minutes, 'minutes', 'number', { 
        min: SERVICE_WORKER_CONFIG.VALIDATION.MIN_VALUE, 
        max: SERVICE_WORKER_CONFIG.VALIDATION.MAX_MINUTES 
      });
      if (!minutesCheck.valid) return { success: false, error: minutesCheck.error };
      
      const timer = await timerEngine.extendTimer(minutes);
      return { success: true, timer };
    }
    
    
    case 'pauseTimer': {
      try {
        const timer = await timerEngine.pauseTimer();
        return { success: true, timer };
      } catch (error) {
        console.error('[AutoPlay] pauseTimer error:', error);
        return { success: false, error: error.message };
      }
    }
    
    case 'resumeTimer': {
      const timer = await timerEngine.resumeTimer();
      return { success: true, timer };
    }
    case 'getTimerStatus': {
      const status = await timerEngine.getTimerStatus();
      return { success: true, status };
    }
    
    // ---- Config Management ----
    case 'syncConfig': {
      const config = await ConfigManager.syncConfig();
      return { success: true, config };
    }
    
    case 'getSelectors': {
      const { platform } = message;
      const selectors = await ConfigManager.getSelectors(platform);
      return { success: true, selectors };
    }
    
    // ---- Settings ----
    case 'getSettings': {
      const result = await chrome.storage.local.get('settings');
      const settings = result.settings || {
        showNotifications: true,
        showOverlay: true,
        defaultTimer: 30
      };
      return { success: true, settings };
    }
    
    case 'saveSettings': {
      const { settings } = message;
      await chrome.storage.local.set({ settings });
      return { success: true };
    }
    
    case 'refreshContextMenus': {
      await createContextMenus();
      return { success: true };
    }
    
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}