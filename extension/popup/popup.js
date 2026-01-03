/**
 * AutoPlay Video Control - Easy Kit
 * Popup Controller - Handles UI interactions and communicates with background service worker
 */

import { AUTOPLAY_CONFIG, getSiteDisplayName } from '../utils/config.js';
import { parseTimeInput, formatSecondsToDisplay, formatDurationMinutes } from '../utils/time-utils.js';
import { trackPageView, trackTimerStart } from '../utils/analytics.js';

// ============================================
// CONSTANTS
// ============================================

const RING_CIRCUMFERENCE = 339.292; // 2π × radius(54px)
const ERROR_DISPLAY_DURATION = 3000; // milliseconds
const POLLING_INTERVAL = 1000; // milliseconds
const FEEDBACK_DISPLAY_DURATION = 1500; // milliseconds

// ============================================// STATE
// ============================================

let currentTimer = null;
let updateInterval = null;
let currentPresets = [...AUTOPLAY_CONFIG.defaultPresets];

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  // Settings Button
  settingsBtn: document.getElementById('settingsBtn'),
  
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
  setBtn: document.getElementById('setBtn')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Setup event listeners immediately (no data dependencies)
    setupEventListeners();
    
    // Batch critical data loads in parallel
    const [storageData, timerStatus] = await Promise.all([
      chrome.storage.local.get(['autoplay-theme', 'timerPresets', 'lastTimer', 'compactMode']),
      chrome.runtime.sendMessage({ action: 'getTimerStatus' }).catch(() => ({ success: false }))
    ]);
    
    // Apply theme immediately
    applyTheme(storageData['autoplay-theme']);
    
    // Apply compact mode
    if (storageData.compactMode) {
      document.body.classList.add('compact');
    }
    
    // Render presets immediately
    if (storageData.timerPresets && Array.isArray(storageData.timerPresets) && storageData.timerPresets.length === 4) {
      currentPresets = storageData.timerPresets;
    }
    renderPresetButtons();
    
    // Display timer status
    if (timerStatus.success && timerStatus.status?.active) {
      currentTimer = timerStatus.status;
      showActiveTimer();
      startLocalUpdates();
    } else {
      showInactiveTimer();
    }
    
    // Non-critical: Load asynchronously without blocking
    detectPlatform().catch(e => console.warn('[AutoPlay] Platform detection failed:', e));
    
    // Track page view
    trackPageView('Popup', 'popup').catch(() => {});
    
    // Note: We use polling in startLocalUpdates instead of message listeners
    // This avoids race conditions with multiple popups
  } catch (error) {
    console.error('[AutoPlay] Popup initialization failed:', error);
  }
});

// ============================================
// THEME HANDLING
// ============================================

function applyTheme(savedTheme) {
  const theme = savedTheme || 'dark';
  document.body.setAttribute('data-theme', theme);
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
    
    // Check if it's the extension's own pages (settings, etc.)
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
      // Check if it's the settings page
      if (url.pathname.includes('settings')) {
        setPlatformBadge('Settings', 'generic');
      } else {
        setPlatformBadge('Extension', 'generic');
      }
      return;
    }
    
    // Use getSiteDisplayName from config.js
    const siteName = getSiteDisplayName(hostname);
    
    if (siteName && siteName !== 'Unknown Site') {
      // Known platform
      setPlatformBadge(siteName, true);
    } else {
      // Unknown platform - extract basic site name
      const extracted = extractSiteName(hostname);
      setPlatformBadge(extracted, 'generic');
    }
  } catch (error) {
    setPlatformBadge('Error', false);
  }
}

function extractSiteName(hostname) {
  // Remove www. prefix and get the main domain name
  let name = hostname.replace(/^www\./, '');
  
  // Split by dots and get the main part (before TLD)
  const parts = name.split('.');
  if (parts.length >= 2) {
    // Get the second-to-last part (main domain name)
    name = parts[parts.length - 2];
  } else {
    name = parts[0];
  }
  
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function setPlatformBadge(text, supported) {
  elements.platformBadge.textContent = text;
  
  // Handle three states: supported (green), generic (yellow/neutral), unsupported (red)
  if (supported === true || supported === 'supported') {
    elements.platformBadge.className = 'platform-badge supported';
  } else if (supported === 'generic') {
    elements.platformBadge.className = 'platform-badge generic';
  } else {
    elements.platformBadge.className = 'platform-badge unsupported';
  }
}

// ============================================
// TIMER MANAGEMENT
// ============================================

async function refreshTimerStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTimerStatus' });
    
    if (response.success && response.status.active) {
      currentTimer = response.status;
      // Ensure status property exists
      if (!currentTimer.status) {
        currentTimer.status = 'active';
      }
      showActiveTimer();
      startLocalUpdates();
    } else {
      currentTimer = null;
      showInactiveTimer();
    }
  } catch (error) {
    console.error('[AutoPlay] Failed to get timer status:', error);
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
      tabId: tab.id,
      source: 'popup'
    });
    
    if (response.success) {
      // Track analytics
      trackTimerStart(minutes * 60, 'popup').catch(() => {});
      
      currentTimer = {
        active: true,
        status: 'active',
        remaining: minutes * 60,
        duration: minutes * 60
      };
      showActiveTimer();
      startLocalUpdates();
    } else {
      alert('Failed to start timer: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('[AutoPlay] Failed to start timer:', error);
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
    console.error('[AutoPlay] Failed to stop timer:', error);
  }
}

async function extendTimer(minutes = 10) {
  try {
    if (!currentTimer) {
      console.warn('[AutoPlay] No active timer to extend');
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
    console.error('[AutoPlay] Failed to extend timer:', error);
  }
}

async function pauseTimer() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'pauseTimer' });
    
    if (response?.success) {
      if (currentTimer) {
        currentTimer.status = 'paused';
      }
      updateTimerDisplay();
      elements.timerLabel.textContent = 'Paused';
      elements.timerRing.classList.add('paused');
    } else {
      console.error('[AutoPlay] pauseTimer failed:', response?.error);
    }
  } catch (error) {
    console.error('[AutoPlay] Failed to pause timer:', error);
  }
}

async function resumeTimer() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'resumeTimer' });
    
    if (response?.success) {
      if (currentTimer) {
        currentTimer.status = 'active';
      }
      updateTimerDisplay();
      elements.timerLabel.textContent = 'remaining';
      elements.timerRing.classList.remove('paused');
    }
  } catch (error) {
    console.error('[AutoPlay] Failed to resume timer:', error);
  }
}

// ============================================
// UI UPDATES
// ============================================

function showActiveTimer() {
  elements.timerRing.classList.add('active');

  elements.timerControls.classList.remove('hidden');
  
  // Check if timer is paused
  if (currentTimer && currentTimer.status === 'paused') {
    elements.timerRing.classList.add('paused');
    elements.timerLabel.textContent = 'Paused';
  } else {
    elements.timerRing.classList.remove('paused');
    elements.timerLabel.textContent = 'remaining';
  }
  
  updateTimerDisplay();
  updateRingProgress();
}

function showInactiveTimer() {
  elements.timerRing.classList.remove('active');
  elements.timerRing.classList.remove('paused');
  elements.timerControls.classList.add('hidden');
  
  // Display first preset as the default
  const firstPresetSeconds = currentPresets[0] || AUTOPLAY_CONFIG.defaultPresets[0];
  elements.timerValue.textContent = formatSecondsToDisplay(firstPresetSeconds);
  elements.timerLabel.textContent = 'Tap to start';
  elements.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
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
  
  const progress = currentTimer.remaining / currentTimer.duration;
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  
  elements.ringProgress.style.strokeDashoffset = offset;
}

function startLocalUpdates() {
  stopLocalUpdates();
  
  // Immediately update the display before starting the interval
  // This ensures the timer shows right away when popup opens
  if (currentTimer?.active || currentTimer?.remaining > 0) {
    showActiveTimer();
  }
  
  // Poll the background for timer status every second instead of local countdown
  // This ensures all popups stay in sync with the authoritative timer state
  updateInterval = setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getTimerStatus' });
      
      if (response?.success && response.status?.active) {
        const previousStatus = currentTimer?.status;
        currentTimer = response.status;
        
        // Update the display
        updateTimerDisplay();
        
        // If status changed (active <-> paused), update UI accordingly
        if (previousStatus !== currentTimer.status) {
          if (currentTimer.status === 'paused') {
            elements.timerLabel.textContent = 'Paused';
            elements.timerRing.classList.add('paused');
          } else {
            elements.timerLabel.textContent = 'remaining';
            elements.timerRing.classList.remove('paused');
          }
        }
      } else {
        // Timer ended or was stopped
        currentTimer = null;
        stopLocalUpdates();
        showInactiveTimer();
      }
    } catch (error) {
      // Extension context may have been invalidated
      console.warn('[AutoPlay] Failed to get timer status:', error);
      stopLocalUpdates();
    }
  }, POLLING_INTERVAL);
}

function stopLocalUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// ============================================
// PRESET TIMERS
// ============================================

function renderPresetButtons() {
  elements.presetsGrid.replaceChildren();
  
  // Skip first preset (index 0) since it's for the main clock
  // Only render presets 2, 3, 4 as buttons
  currentPresets.slice(1).forEach((seconds, index) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.seconds = seconds;
    btn.dataset.index = index + 1; // Adjust index since we sliced
    btn.textContent = formatSecondsToDisplay(seconds);
    btn.addEventListener('click', () => startPresetTimer(seconds));
    elements.presetsGrid.appendChild(btn);
  });
}

function startPresetTimer(seconds) {
  startTimer(seconds / 60); // Convert to minutes
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Settings button
  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener('click', () => {
      console.log('[AutoPlay] Opening settings page');
      chrome.runtime.openOptionsPage();
    });
  } else {
    console.error('[AutoPlay] Settings button not found!');
  }
  
  // Main timer ring click (starts first preset when inactive)
  elements.timerRing.addEventListener('click', handleTimerRingClick);
  
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
}

function handleTimerRingClick() {
  // If timer is inactive, start it with first preset
  if (!currentTimer || !currentTimer.active) {
    const firstPresetSeconds = currentPresets[0] || AUTOPLAY_CONFIG.defaultPresets[0];
    startPresetTimer(firstPresetSeconds);
    return;
  }
  
  // If timer is active, toggle pause/resume
  if (currentTimer.status === 'paused') {
    resumeTimer();
  } else {
    pauseTimer();
  }
}

function handleCustomInput() {
  const input = elements.customInput.value.trim();
  
  // Clear previous error
  hideInputError();
  
  if (!input) {
    showInputError('Please enter a duration');
    return;
  }
  
  const seconds = parseTimeInput(input);
  
  if (!seconds || seconds < 1) {
    showInputError('Invalid format. Use: 30s, 5m, 1h 30m');
    return;
  }
  
  const maxSeconds = 24 * 60 * 60; // 24 hours
  if (seconds > maxSeconds) {
    showInputError('Maximum timer is 24 hours');
    return;
  }
  
  // Convert to minutes for timer engine (supports fractional)
  startTimer(seconds / 60);
  elements.customInput.value = '';
}

function showInputError(message) {
  const errorEl = document.getElementById('inputError');
  const errorText = document.getElementById('errorText');
  const hintEl = document.getElementById('inputHint');
  
  if (errorEl && errorText) {
    errorText.textContent = message;
    errorEl.classList.remove('hidden');
    elements.customInput.classList.add('input-error-state');
    if (hintEl) hintEl.classList.add('hidden');
    
    // Auto-hide after 3 seconds
    setTimeout(() => hideInputError(), ERROR_DISPLAY_DURATION);
  }
}

function hideInputError() {
  const errorEl = document.getElementById('inputError');
  const hintEl = document.getElementById('inputHint');
  
  if (errorEl) {
    errorEl.classList.add('hidden');
    elements.customInput.classList.remove('input-error-state');
    if (hintEl) hintEl.classList.remove('hidden');
  }
}

// Note: Message handling removed - popup uses polling via startLocalUpdates
// This prevents race conditions when multiple popups are open

// ============================================
// CLEANUP
// ============================================

window.addEventListener('unload', () => {
  stopLocalUpdates();
});
