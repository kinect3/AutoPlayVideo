import { ConfigManager } from '../utils/config-manager.js';
import { timerEngine } from './timer-engine.js';

// ============================================
// INSTALLATION & STARTUP
// ============================================

// Default presets in seconds
const DEFAULT_PRESETS = [
  15 * 60,   // 15m
  30 * 60,   // 30m
  45 * 60,   // 45m
  60 * 60,   // 1h
  90 * 60,   // 1h 30m
  120 * 60   // 2h
];

// Format seconds to display string
function formatSecondsToDisplay(totalSeconds) {
  if (totalSeconds < 60) return totalSeconds + 's';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  let result = '';
  if (hours > 0) result += hours + 'h ';
  if (minutes > 0) result += minutes + 'm';
  if (seconds > 0 && hours === 0) result += (minutes > 0 ? ' ' : '') + seconds + 's';
  return result.trim() || '0s';
}

// Create context menu items
async function createContextMenus() {
  // Remove existing menus first
  await chrome.contextMenus.removeAll();
  
  // Create parent menu
  chrome.contextMenus.create({
    id: 'viboot-parent',
    title: '⏱️ Set Timer',
    contexts: ['page', 'video']
  });
  
  // Get user's custom presets or use defaults
  const result = await chrome.storage.local.get('timerPresets');
  const presets = result.timerPresets || DEFAULT_PRESETS;
  
  // Create menu items for each preset
  presets.forEach((seconds, index) => {
    chrome.contextMenus.create({
      id: `viboot-preset-${index}`,
      parentId: 'viboot-parent',
      title: formatSecondsToDisplay(seconds),
      contexts: ['page', 'video']
    });
  });
  
  // Add separator
  chrome.contextMenus.create({
    id: 'viboot-separator',
    parentId: 'viboot-parent',
    type: 'separator',
    contexts: ['page', 'video']
  });
  
  // Add custom duration option
  chrome.contextMenus.create({
    id: 'viboot-custom',
    parentId: 'viboot-parent',
    title: '⚙️ Custom Duration...',
    contexts: ['page', 'video']
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.toString().startsWith('viboot-')) return;
  
  const menuId = info.menuItemId.toString();
  
  if (menuId === 'viboot-custom') {
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
      console.error('[Viboot] Failed to show custom prompt:', error);
    }
    return;
  }
  
  if (menuId.startsWith('viboot-preset-')) {
    const index = parseInt(menuId.replace('viboot-preset-', ''), 10);
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
    console.log("[Viboot] Extension installed. Starting initial setup...");
    
    // Create context menus
    await createContextMenus();
    
    // Sync remote config (non-blocking)
    ConfigManager.syncConfig().catch(e => 
      console.warn('[Viboot] Initial config sync failed:', e.message)
    );
    
    // Schedule daily config sync (every 24 hours)
    await chrome.alarms.create('dailyConfigSync', { periodInMinutes: 1440 });
    
    console.log("[Viboot] Setup complete.");
  } catch (error) {
    console.error('[Viboot] Installation error:', error);
  }
});

// Restore timer when service worker starts (browser restart)
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Viboot] Browser started. Checking for active timer...");
  await timerEngine.restoreTimer();
});

// Also restore on service worker wake-up
(async () => {
  try {
    await timerEngine.restoreTimer();
  } catch (error) {
    console.error('[Viboot] Failed to restore timer on wake:', error);
  }
})();

// ============================================
// ALARMS (Scheduled Tasks)
// ============================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === 'dailyConfigSync') {
      console.log("[Viboot] Running daily config sync...");
      await ConfigManager.syncConfig();
    } else if (alarm.name.startsWith('viboot')) {
      // Handle timer alarms (vibootTimerTick, vibootTimerExpiry)
      await timerEngine.handleAlarm(alarm.name);
    }
  } catch (error) {
    console.error('[Viboot] Alarm handler error:', error);
  }
});

// ============================================
// MESSAGE HANDLING (Popup & Content Scripts)
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async operations
  handleMessage(message, sender)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  // Return true to indicate async response
  return true;
});

async function handleMessage(message, sender) {
  const { action } = message;
  
  switch (action) {
    // ---- Timer Controls ----
    case 'startTimer': {
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
          return { success: true, timer };
        }
        return { success: false, error: 'No active tab found' };
      }
      
      const timer = await timerEngine.startTimer(minutes, tabId);
      return { success: true, timer };
    }
    
    case 'stopTimer': {
      await timerEngine.stopTimer();
      return { success: true };
    }
    
    case 'extendTimer': {
      const { minutes } = message;
      const timer = await timerEngine.extendTimer(minutes);
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