/**
 * Viboot Popup Controller
 * Handles UI interactions and communicates with background service worker
 */

// ============================================
// STATE
// ============================================

let currentTimer = null;
let updateInterval = null;

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  // Theme
  themeToggle: document.getElementById('themeToggle'),
  themeIcon: document.getElementById('themeIcon'),
  
  // Platform
  platformBadge: document.getElementById('platformBadge'),
  
  // Timer Display
  timerRing: document.getElementById('timerRing'),
  timerValue: document.getElementById('timerValue'),
  timerLabel: document.getElementById('timerLabel'),
  ringProgress: document.getElementById('ringProgress'),
  
  // Controls
  timerControls: document.getElementById('timerControls'),
  extendBtn: document.getElementById('extendBtn'),
  stopBtn: document.getElementById('stopBtn'),
  
  // Presets & Input
  presetsSection: document.getElementById('presetsSection'),
  inputSection: document.getElementById('inputSection'),
  presetBtns: document.querySelectorAll('.preset-btn'),
  customInput: document.getElementById('customInput'),
  setBtn: document.getElementById('setBtn'),
  
  // Settings
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  toggleArrow: document.getElementById('toggleArrow'),
  showOverlay: document.getElementById('showOverlay'),
  showNotifications: document.getElementById('showNotifications'),
  autoPauseNext: document.getElementById('autoPauseNext'),
  
  // Custom Timer
  customPresetBtn: document.getElementById('customPresetBtn'),
  customTimerValue: document.getElementById('customTimerValue'),
  saveCustomBtn: document.getElementById('saveCustomBtn')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load theme
    loadTheme();
    
    // Load settings (non-blocking)
    loadSettings().catch(e => console.warn('[Viboot] Settings load failed:', e));
    
    // Load custom timer preset (non-blocking)
    loadCustomTimer().catch(e => console.warn('[Viboot] Custom timer load failed:', e));
    
    // Detect platform
    await detectPlatform();
    
    // Get current timer status
    await refreshTimerStatus();
    
    // Set up event listeners
    setupEventListeners();
    
    // Listen for timer updates from background
    chrome.runtime.onMessage.addListener(handleMessage);
  } catch (error) {
    console.error('[Viboot] Popup initialization failed:', error);
  }
});

// ============================================
// THEME HANDLING
// ============================================

function loadTheme() {
  const savedTheme = localStorage.getItem('viboot-theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('viboot-theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  elements.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ============================================
// PLATFORM DETECTION
// ============================================

async function detectPlatform() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.url) {
      setPlatformBadge('Unknown', false);
      return;
    }
    
    const url = new URL(tab.url);
    const hostname = url.hostname;
    
    const platforms = {
      'netflix.com': 'Netflix',
      'youtube.com': 'YouTube',
      'disneyplus.com': 'Disney+',
      'amazon.com': 'Prime Video',
      'primevideo.com': 'Prime Video',
      'hbomax.com': 'HBO Max',
      'max.com': 'Max',
      'crunchyroll.com': 'Crunchyroll'
    };
    
    let detected = null;
    for (const [domain, name] of Object.entries(platforms)) {
      if (hostname.includes(domain)) {
        detected = name;
        break;
      }
    }
    
    if (detected) {
      setPlatformBadge(detected, true);
    } else {
      setPlatformBadge('Not supported', false);
    }
  } catch (error) {
    setPlatformBadge('Error', false);
  }
}

function setPlatformBadge(text, supported) {
  elements.platformBadge.textContent = text;
  elements.platformBadge.className = 'platform-badge ' + (supported ? 'supported' : 'unsupported');
}

// ============================================
// TIMER MANAGEMENT
// ============================================

async function refreshTimerStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTimerStatus' });
    
    if (response.success && response.status.active) {
      currentTimer = response.status;
      showActiveTimer();
      startLocalUpdates();
    } else {
      currentTimer = null;
      showInactiveTimer();
    }
  } catch (error) {
    console.error('[Viboot] Failed to get timer status:', error);
    showInactiveTimer();
  }
}

async function startTimer(minutes) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      alert('Cannot access current tab');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'startTimer',
      minutes: minutes,
      tabId: tab.id
    });
    
    if (response.success) {
      currentTimer = {
        active: true,
        remaining: minutes * 60,
        duration: minutes * 60
      };
      showActiveTimer();
      startLocalUpdates();
    } else {
      alert('Failed to start timer: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('[Viboot] Failed to start timer:', error);
    alert('Failed to start timer');
  }
}

async function stopTimer() {
  try {
    await chrome.runtime.sendMessage({ action: 'stopTimer' });
    currentTimer = null;
    stopLocalUpdates();
    showInactiveTimer();
  } catch (error) {
    console.error('[Viboot] Failed to stop timer:', error);
  }
}

async function extendTimer(minutes = 10) {
  try {
    if (!currentTimer) {
      console.warn('[Viboot] No active timer to extend');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'extendTimer',
      minutes: minutes
    });
    
    if (response?.success) {
      currentTimer.remaining += minutes * 60;
      currentTimer.duration += minutes * 60;
      updateTimerDisplay();
    }
  } catch (error) {
    console.error('[Viboot] Failed to extend timer:', error);
  }
}

// ============================================
// UI UPDATES
// ============================================

function showActiveTimer() {
  elements.timerRing.classList.add('active');
  elements.timerControls.classList.remove('hidden');
  elements.timerLabel.textContent = 'remaining';
  updateTimerDisplay();
  updateRingProgress();
}

function showInactiveTimer() {
  elements.timerRing.classList.remove('active');
  elements.timerControls.classList.add('hidden');
  elements.timerValue.textContent = '--:--';
  elements.timerLabel.textContent = 'No timer active';
  elements.ringProgress.style.strokeDashoffset = '339.292';
}

function updateTimerDisplay() {
  if (!currentTimer) return;
  
  const remaining = currentTimer.remaining;
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  
  if (hours > 0) {
    elements.timerValue.textContent = 
      `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    elements.timerValue.textContent = 
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  
  updateRingProgress();
}

function updateRingProgress() {
  if (!currentTimer) return;
  
  const circumference = 339.292; // 2 * PI * 54 (radius)
  const progress = currentTimer.remaining / currentTimer.duration;
  const offset = circumference * (1 - progress);
  
  elements.ringProgress.style.strokeDashoffset = offset;
}

function startLocalUpdates() {
  stopLocalUpdates();
  
  updateInterval = setInterval(() => {
    if (currentTimer && currentTimer.remaining > 0) {
      currentTimer.remaining--;
      updateTimerDisplay();
      
      if (currentTimer.remaining <= 0) {
        stopLocalUpdates();
        showInactiveTimer();
      }
    }
  }, 1000);
}

function stopLocalUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// ============================================
// INPUT PARSING
// ============================================

/**
 * Parse time input string to seconds
 * Supports: 30 (seconds), 30s, 5m, 1h, 1h 30m 45s
 * @returns {number|null} seconds or null if invalid
 */
function parseTimeInput(input) {
  input = input.trim().toLowerCase();
  
  // Empty input
  if (!input) return null;
  
  // Pure number = seconds (for custom timer flexibility)
  if (/^\d+$/.test(input)) {
    return parseInt(input, 10);
  }
  
  let totalSeconds = 0;
  
  // Hours
  const hourMatch = input.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hourMatch) {
    totalSeconds += parseFloat(hourMatch[1]) * 3600;
  }
  
  // Minutes
  const minMatch = input.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  if (minMatch) {
    totalSeconds += parseFloat(minMatch[1]) * 60;
  }
  
  // Seconds
  const secMatch = input.match(/(\d+(?:\.\d+)?)\s*s/);
  if (secMatch) {
    totalSeconds += parseFloat(secMatch[1]);
  }
  
  return totalSeconds > 0 ? Math.round(totalSeconds) : null;
}

/**
 * Format seconds to human readable string
 */
function formatSecondsToDisplay(totalSeconds) {
  if (totalSeconds < 60) {
    return totalSeconds + 's';
  }
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  
  let result = '';
  if (hours > 0) result += hours + 'h ';
  if (minutes > 0) result += minutes + 'm';
  if (seconds > 0 && hours === 0) result += (minutes > 0 ? ' ' : '') + seconds + 's';
  
  return result.trim() || '0s';
}

// ============================================
// SETTINGS
// ============================================

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    
    if (response.success) {
      const settings = response.settings;
      elements.showOverlay.checked = settings.showOverlay ?? true;
      elements.showNotifications.checked = settings.showNotifications ?? true;
      elements.autoPauseNext.checked = settings.autoPauseNext ?? false;
    }
  } catch (error) {
    console.error('[Viboot] Failed to load settings:', error);
  }
}

async function saveSettings() {
  try {
    const settings = {
      showOverlay: elements.showOverlay.checked,
      showNotifications: elements.showNotifications.checked,
      autoPauseNext: elements.autoPauseNext.checked
    };
    
    await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: settings
    });
  } catch (error) {
    console.error('[Viboot] Failed to save settings:', error);
  }
}

// ============================================
// CUSTOM TIMER PRESET
// ============================================

// Default custom timer: 30 minutes in seconds
const DEFAULT_CUSTOM_TIMER = 30 * 60;

async function loadCustomTimer() {
  try {
    const result = await chrome.storage.local.get('customTimerSeconds');
    const seconds = result.customTimerSeconds ?? DEFAULT_CUSTOM_TIMER;
    
    // Update button text
    updateCustomPresetButton(seconds);
    
    // Update input field
    elements.customTimerValue.value = formatSecondsToDisplay(seconds);
  } catch (error) {
    console.error('[Viboot] Failed to load custom timer:', error);
    updateCustomPresetButton(DEFAULT_CUSTOM_TIMER);
  }
}

async function saveCustomTimer() {
  const input = elements.customTimerValue.value;
  const seconds = parseTimeInput(input);
  
  if (!seconds || seconds < 1) {
    elements.customTimerValue.style.borderColor = 'var(--danger)';
    setTimeout(() => {
      elements.customTimerValue.style.borderColor = '';
    }, 1000);
    return;
  }
  
  const maxSeconds = 24 * 60 * 60; // 24 hours
  if (seconds > maxSeconds) {
    alert('Maximum is 24 hours');
    return;
  }
  
  try {
    await chrome.storage.local.set({ customTimerSeconds: seconds });
    updateCustomPresetButton(seconds);
    
    // Show save confirmation
    elements.saveCustomBtn.textContent = '✓';
    elements.saveCustomBtn.style.background = 'var(--success)';
    setTimeout(() => {
      elements.saveCustomBtn.textContent = '💾';
      elements.saveCustomBtn.style.background = '';
    }, 1500);
    
    // Update input to normalized format
    elements.customTimerValue.value = formatSecondsToDisplay(seconds);
  } catch (error) {
    console.error('[Viboot] Failed to save custom timer:', error);
  }
}

function updateCustomPresetButton(seconds) {
  const displayText = '⭐ ' + formatSecondsToDisplay(seconds);
  elements.customPresetBtn.textContent = displayText;
  elements.customPresetBtn.dataset.seconds = seconds;
}

async function startCustomTimer() {
  try {
    const result = await chrome.storage.local.get('customTimerSeconds');
    const seconds = result.customTimerSeconds ?? DEFAULT_CUSTOM_TIMER;
    startTimer(seconds / 60); // Convert to minutes
  } catch (error) {
    console.error('[Viboot] Failed to start custom timer:', error);
    startTimer(30); // Fallback to 30 minutes
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Theme toggle
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Preset buttons (excluding custom preset)
  elements.presetBtns.forEach(btn => {
    if (!btn.dataset.custom) {
      btn.addEventListener('click', () => {
        const minutes = parseInt(btn.dataset.minutes, 10);
        startTimer(minutes);
      });
    }
  });
  
  // Custom preset button
  elements.customPresetBtn.addEventListener('click', startCustomTimer);
  
  // Custom input
  elements.setBtn.addEventListener('click', handleCustomInput);
  elements.customInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleCustomInput();
    }
  });
  
  // Timer controls
  elements.extendBtn.addEventListener('click', () => extendTimer(10));
  elements.stopBtn.addEventListener('click', stopTimer);
  
  // Settings toggle
  elements.settingsToggle.addEventListener('click', () => {
    elements.settingsPanel.classList.toggle('hidden');
    elements.toggleArrow.classList.toggle('open');
  });
  
  // Settings changes
  elements.showOverlay.addEventListener('change', saveSettings);
  elements.showNotifications.addEventListener('change', saveSettings);
  elements.autoPauseNext.addEventListener('change', saveSettings);
  
  // Custom timer save
  elements.saveCustomBtn.addEventListener('click', saveCustomTimer);
  elements.customTimerValue.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveCustomTimer();
    }
  });
}

function handleCustomInput() {
  const input = elements.customInput.value;
  const seconds = parseTimeInput(input);
  
  if (!seconds || seconds < 1) {
    elements.customInput.style.borderColor = 'var(--danger)';
    setTimeout(() => {
      elements.customInput.style.borderColor = '';
    }, 1000);
    return;
  }
  
  const maxSeconds = 24 * 60 * 60; // 24 hours
  if (seconds > maxSeconds) {
    alert('Maximum timer is 24 hours');
    return;
  }
  
  // Convert to minutes for timer engine (supports fractional)
  startTimer(seconds / 60);
  elements.customInput.value = '';
}

// ============================================
// MESSAGE HANDLING
// ============================================

function handleMessage(message) {
  if (message.action === 'timerUpdate' && message.status) {
    currentTimer = message.status;
    
    if (currentTimer.active) {
      showActiveTimer();
    } else {
      showInactiveTimer();
    }
  }
}

// ============================================
// CLEANUP
// ============================================

window.addEventListener('unload', () => {
  stopLocalUpdates();
});
