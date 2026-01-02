/**
 * Viboot Storage Utility
 * Wrapper around chrome.storage.local with type safety and defaults
 */

// Default values for all stored data
const DEFAULTS = {
  settings: {
    showNotifications: true,
    showOverlay: true,
    autoSkipIntro: false,
    autoSkipAds: false,
    autoPauseNext: false,
    defaultTimer: 30
  },
  activeTimer: null,
  selectorConfig: null,
  lastSynced: null
};

/**
 * Get value from storage with default fallback
 * @param {string} key - Storage key
 * @returns {Promise<any>} Stored value or default
 */
export async function get(key) {
  try {
    const result = await chrome.storage.local.get([key]);
    return result[key] ?? DEFAULTS[key] ?? null;
  } catch (error) {
    console.error(`[Viboot] Storage get error for key "${key}":`, error);
    return DEFAULTS[key] ?? null;
  }
}

/**
 * Set value in storage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<boolean>} Success status
 */
export async function set(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (error) {
    console.error(`[Viboot] Storage set error for key "${key}":`, error);
    return false;
  }
}

/**
 * Remove value from storage
 * @param {string} key - Storage key
 * @returns {Promise<boolean>} Success status
 */
export async function remove(key) {
  try {
    await chrome.storage.local.remove(key);
    return true;
  } catch (error) {
    console.error(`[Viboot] Storage remove error for key "${key}":`, error);
    return false;
  }
}

/**
 * Get settings with defaults merged
 * @returns {Promise<object>} Settings object
 */
export async function getSettings() {
  const stored = await get('settings');
  return { ...DEFAULTS.settings, ...stored };
}

/**
 * Update settings (merge with existing)
 * @param {object} updates - Partial settings to update
 * @returns {Promise<boolean>} Success status
 */
export async function updateSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates };
  return set('settings', merged);
}

/**
 * Get active timer state
 * @returns {Promise<object|null>} Timer state or null
 */
export async function getActiveTimer() {
  return get('activeTimer');
}

/**
 * Set active timer state
 * @param {object|null} timer - Timer state or null to clear
 * @returns {Promise<boolean>} Success status
 */
export async function setActiveTimer(timer) {
  if (timer === null) {
    return remove('activeTimer');
  }
  return set('activeTimer', timer);
}

/**
 * Get selector config
 * @returns {Promise<object|null>} Selector config or null
 */
export async function getSelectorConfig() {
  return get('selectorConfig');
}

/**
 * Clear all stored data
 * @returns {Promise<boolean>} Success status
 */
export async function clearAll() {
  try {
    await chrome.storage.local.clear();
    return true;
  } catch (error) {
    console.error('[Viboot] Storage clear error:', error);
    return false;
  }
}

// Export as namespace for convenience
export const Storage = {
  get,
  set,
  remove,
  getSettings,
  updateSettings,
  getActiveTimer,
  setActiveTimer,
  getSelectorConfig,
  clearAll,
  DEFAULTS
};