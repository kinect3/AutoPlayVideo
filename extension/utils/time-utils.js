/**
 * Shared Time Utilities
 * Consolidated time parsing and formatting functions
 * Used across popup, settings, service worker (as ES6 module)
 * 
 * Note: Content scripts load functions from streaming-controller.js directly
 */

/**
 * Parse time input to seconds
 * Supports multiple formats:
 * - Plain numbers: "30" = 30 seconds
 * - Seconds: "30s", "45s"
 * - Minutes: "5m", "30m"
 * - Hours: "1h", "2h"
 * - Combined: "1h30m", "1h 30m 45s"
 * 
 * @param {string} input - Time string to parse
 * @returns {number|null} Seconds or null if invalid
 */
function parseTimeInput(input) {
  if (!input) return null;
  
  input = input.trim().toLowerCase();
  if (!input) return null;
  
  // Pure number = seconds (for flexibility)
  if (/^\d+(?:\.\d+)?$/.test(input)) {
    const seconds = parseFloat(input);
    return (seconds >= 1 && seconds <= 86400) ? Math.round(seconds) : null;
  }
  
  // Parse h/m/s format
  let totalSeconds = 0;
  const regex = /(\d+(?:\.\d+)?)\s*([smh])/g;
  const unitValues = { s: 1, m: 60, h: 3600 };
  let match;
  
  while ((match = regex.exec(input)) !== null) {
    totalSeconds += parseFloat(match[1]) * unitValues[match[2]];
  }
  
  // Validate range (1 second to 24 hours)
  if (totalSeconds < 1 || totalSeconds > 86400) return null;
  
  return Math.round(totalSeconds);
}

/**
 * Format seconds to human-readable string
 * Examples: 30s, 5m, 1h 30m, 2h
 * 
 * @param {number} totalSeconds - Seconds to format
 * @returns {string} Formatted time string
 */
function formatSecondsToDisplay(totalSeconds) {
  if (totalSeconds < 60) {
    return totalSeconds + 's';
  }
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  
  const parts = [];
  if (hours > 0) parts.push(hours + 'h');
  if (minutes > 0) parts.push(minutes + 'm');
  if (seconds > 0 && hours === 0) parts.push(seconds + 's');
  
  return parts.join(' ') || '0s';
}

/**
 * Format seconds for countdown display (MM:SS or H:MM:SS)
 * Used in timer overlays and displays
 * 
 * @param {number} remaining - Seconds remaining
 * @returns {string} Formatted countdown (e.g., "05:30" or "1:05:30")
 */
function formatCountdown(remaining) {
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format duration for display in minutes/hours
 * Used for timer history and summaries
 * 
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted duration (e.g., "30min", "1h 30m")
 */
function formatDurationMinutes(seconds) {
  if (!seconds) return '--';
  
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}min`;
  
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

/**
 * Validate time duration
 * Ensures value is within acceptable range
 * 
 * @param {number} seconds - Seconds to validate
 * @param {number} min - Minimum allowed (default 1)
 * @param {number} max - Maximum allowed (default 86400 = 24h)
 * @returns {boolean} True if valid
 */
function isValidDuration(seconds, min = 1, max = 86400) {
  return typeof seconds === 'number' && seconds >= min && seconds <= max;
}

/**
 * Convert minutes to seconds
 * @param {number} minutes
 * @returns {number} seconds
 */
function minutesToSeconds(minutes) {
  return Math.round(minutes * 60);
}

/**
 * Convert seconds to minutes
 * @param {number} seconds
 * @returns {number} minutes
 */
function secondsToMinutes(seconds) {
  return seconds / 60;
}

// Export for ES6 modules (service worker, popup, settings)
export {
  parseTimeInput,
  formatSecondsToDisplay,
  formatCountdown,
  formatDurationMinutes,
  isValidDuration,
  minutesToSeconds,
  secondsToMinutes
};
