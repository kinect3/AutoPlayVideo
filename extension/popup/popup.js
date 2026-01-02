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
  presetsGrid: document.getElementById('presetsGrid'),
  inputSection: document.getElementById('inputSection'),
  customInput: document.getElementById('customInput'),
  setBtn: document.getElementById('setBtn'),
  
  // Settings
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  toggleArrow: document.getElementById('toggleArrow'),
  showOverlay: document.getElementById('showOverlay'),
  showNotifications: document.getElementById('showNotifications'),
  autoPauseNext: document.getElementById('autoPauseNext'),
  
  // Presets Editor
  editPresetsBtn: document.getElementById('editPresetsBtn'),
  presetsEditor: document.getElementById('presetsEditor'),
  savePresetsBtn: document.getElementById('savePresetsBtn'),
  resetPresetsBtn: document.getElementById('resetPresetsBtn'),
  presetInputs: [
    document.getElementById('preset1'),
    document.getElementById('preset2'),
    document.getElementById('preset3'),
    document.getElementById('preset4'),
    document.getElementById('preset5'),
    document.getElementById('preset6')
  ]
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
    
    // Load presets and render buttons
    await loadPresets();
    
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
// PRESET TIMERS
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

let currentPresets = [...DEFAULT_PRESETS];

async function loadPresets() {
  try {
    const result = await chrome.storage.local.get('timerPresets');
    if (result.timerPresets && Array.isArray(result.timerPresets) && result.timerPresets.length === 6) {
      currentPresets = result.timerPresets;
    } else {
      currentPresets = [...DEFAULT_PRESETS];
    }
    
    // Render the preset buttons
    renderPresetButtons();
    
    // Populate editor inputs
    populatePresetEditor();
  } catch (error) {
    console.error('[Viboot] Failed to load presets:', error);
    currentPresets = [...DEFAULT_PRESETS];
    renderPresetButtons();
  }
}

function renderPresetButtons() {
  elements.presetsGrid.innerHTML = '';
  
  currentPresets.forEach((seconds, index) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.seconds = seconds;
    btn.dataset.index = index;
    btn.textContent = formatSecondsToDisplay(seconds);
    btn.addEventListener('click', () => startPresetTimer(seconds));
    elements.presetsGrid.appendChild(btn);
  });
}

function startPresetTimer(seconds) {
  startTimer(seconds / 60); // Convert to minutes
}

function populatePresetEditor() {
  currentPresets.forEach((seconds, index) => {
    if (elements.presetInputs[index]) {
      elements.presetInputs[index].value = formatSecondsToDisplay(seconds);
    }
  });
}

async function savePresets() {
  const newPresets = [];
  let hasError = false;
  
  for (let i = 0; i < 6; i++) {
    const input = elements.presetInputs[i];
    const value = input.value.trim();
    
    if (!value) {
      // Use default if empty
      newPresets.push(DEFAULT_PRESETS[i]);
      input.value = formatSecondsToDisplay(DEFAULT_PRESETS[i]);
      continue;
    }
    
    const seconds = parseTimeInput(value);
    
    if (!seconds || seconds < 1) {
      input.style.borderColor = 'var(--danger)';
      hasError = true;
      continue;
    }
    
    const maxSeconds = 24 * 60 * 60; // 24 hours
    if (seconds > maxSeconds) {
      input.style.borderColor = 'var(--danger)';
      hasError = true;
      continue;
    }
    
    input.style.borderColor = '';
    newPresets.push(seconds);
    input.value = formatSecondsToDisplay(seconds);
  }
  
  if (hasError) {
    setTimeout(() => {
      elements.presetInputs.forEach(input => {
        input.style.borderColor = '';
      });
    }, 1500);
    return;
  }
  
  try {
    await chrome.storage.local.set({ timerPresets: newPresets });
    currentPresets = newPresets;
    renderPresetButtons();
    
    // Show success feedback
    elements.savePresetsBtn.textContent = '✓ Saved!';
    elements.savePresetsBtn.style.background = 'var(--success)';
    setTimeout(() => {
      elements.savePresetsBtn.textContent = '💾 Save';
      elements.savePresetsBtn.style.background = '';
    }, 1500);
  } catch (error) {
    console.error('[Viboot] Failed to save presets:', error);
  }
}

async function resetPresets() {
  try {
    await chrome.storage.local.remove('timerPresets');
    currentPresets = [...DEFAULT_PRESETS];
    renderPresetButtons();
    populatePresetEditor();
    
    // Show reset feedback
    elements.resetPresetsBtn.textContent = '✓ Reset!';
    setTimeout(() => {
      elements.resetPresetsBtn.textContent = '↩️ Reset';
    }, 1500);
  } catch (error) {
    console.error('[Viboot] Failed to reset presets:', error);
  }
}

function togglePresetsEditor() {
  const isHidden = elements.presetsEditor.classList.contains('hidden');
  elements.presetsEditor.classList.toggle('hidden');
  elements.editPresetsBtn.classList.toggle('active', isHidden);
  elements.editPresetsBtn.textContent = isHidden ? '✏️ Done' : '✏️ Edit';
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Theme toggle
  elements.themeToggle.addEventListener('click', toggleTheme);
  
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
  
  // Presets editor
  elements.editPresetsBtn.addEventListener('click', togglePresetsEditor);
  elements.savePresetsBtn.addEventListener('click', savePresets);
  elements.resetPresetsBtn.addEventListener('click', resetPresets);
  
  // Enter key in preset inputs
  elements.presetInputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        savePresets();
      }
    });
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
