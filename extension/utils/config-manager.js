// Hardcoded defaults in case the server is down
const DEFAULT_CONFIG = {
  netflix: {
    nextButton: "[data-uia='next-episode-seamless-button']",
    skipIntroButton: "[data-uia='player-skip-intro']",
    playerContainer: ".nfp-chrome-player-layer"
  },
  youtube: {
    skipAdButton: ".ytp-ad-skip-button",
    playerContainer: "#movie_player",
    autonavScreen: ".ytp-autonav-endscreen-countdown-overlay"
  },
  crunchyroll: {
    skipIntroButton: ".skip-intro-button",
    nextButton: ".next-episode-button"
  },
  disney: {
    skipIntroButton: "[data-testid='skip-intro-button']",
    nextButton: "[data-testid='up-next-button']"
  },
  prime: {
    skipIntroButton: ".skipElement",
    nextButton: ".nextUpCard"
  },
  hbo: {
    skipIntroButton: "[data-testid='player-advancement-skip-button']",
    skipCreditsButton: "[data-testid='player-advancement-skip-credits']",
    nextEpisodeButton: "[data-testid='player-advancement-next-up']"
  },
  twitch: {
    playerContainer: ".video-player"
  },
  hulu: {
    skipIntroButton: ".skip-intro-button"
  },
  generic: {}
};

// ============================================
// CONFIGURATION CONSTANTS
// ============================================

const CONFIG_MANAGER_SETTINGS = {
  API_URL: "https://viboot.onrender.com/api/selectors",
  TELEMETRY_URL: "https://viboot.onrender.com/api/telemetry",
  FETCH_TIMEOUT: 10000,           // 10 seconds
  MAX_RETRIES: 3,                 // Retry attempts for config fetch
  RETRY_DELAYS: [0, 2000, 5000],  // Retry delays: immediate, 2s, 5s
  CACHE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
  TELEMETRY: {
    BATCH_DELAY: 1000,            // 1 second batch delay
    MAX_BATCH_SIZE: 10            // Max events per batch
  }
};

// Telemetry batching to prevent server spam
let telemetryQueue = [];
let telemetryFlushTimer = null;

// In-memory cache for selectors (reduces storage reads)
let memoryCache = {
  config: null,
  timestamp: null,
  version: null
};

export class ConfigManager {
  /**
   * Fetch with timeout to prevent hanging requests
   */
  static async fetchWithTimeout(url, timeout = CONFIG_MANAGER_SETTINGS.FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  }

  static validatePlatformSelectors(platform, selectors) {
    if (!selectors || typeof selectors !== 'object') {
      return false;
    }
    
    // Check that at least one selector is a non-empty string
    const values = Object.values(selectors);
    if (values.length === 0) {
      return false;
    }
    
    for (const selector of values) {
      if (typeof selector === 'string' && selector.trim().length > 0) {
        return true; // At least one valid selector
      }
    }
    
    return false;
  }

  static async syncConfig() {
    const startTime = Date.now();
    let retryCount = 0;
    let lastError = null;
    
    try {
      console.log("[AutoPlay] Syncing remote selectors...");
      
      let response = null;
      
      // Retry with exponential backoff
      for (let attempt = 0; attempt < CONFIG_MANAGER_SETTINGS.MAX_RETRIES; attempt++) {
        retryCount = attempt;
        try {
          if (attempt > 0) {
            console.log(`[AutoPlay] Retry attempt ${attempt + 1}/${CONFIG_MANAGER_SETTINGS.MAX_RETRIES}...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG_MANAGER_SETTINGS.RETRY_DELAYS[attempt]));
          }
          
          response = await this.fetchWithTimeout(CONFIG_MANAGER_SETTINGS.API_URL);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Success - break retry loop
          break;
        } catch (error) {
          lastError = error;
          if (attempt === CONFIG_MANAGER_SETTINGS.MAX_RETRIES - 1) {
            throw error; // Final attempt failed
          }
        }
      }
      
      if (!response) {
        throw new Error('All retry attempts failed');
      }
      
      const remoteConfig = await response.json();
      
      // Validate config structure
      if (!remoteConfig || typeof remoteConfig !== 'object') {
        throw new Error('Invalid config format: not an object');
      }
      
      if (!remoteConfig.platforms || typeof remoteConfig.platforms !== 'object') {
        throw new Error('Invalid config format: missing platforms');
      }
      
      // Validate each platform's selectors
      const validatedPlatforms = {};
      for (const [platform, selectors] of Object.entries(remoteConfig.platforms)) {
        if (this.validatePlatformSelectors(platform, selectors)) {
          validatedPlatforms[platform] = selectors;
        } else {
          console.warn(`[AutoPlay] Invalid selectors for ${platform}, using existing/defaults`);
        }
      }
      
      // Smart merge: preserve existing platforms not in update
      const existingData = await chrome.storage.local.get(['selectorConfig']);
      const existingConfig = existingData.selectorConfig || {};
      const mergedConfig = { ...existingConfig, ...validatedPlatforms };
      
      await chrome.storage.local.set({ 
        selectorConfig: mergedConfig,
        lastSynced: Date.now(),
        configVersion: remoteConfig.version || 'unknown'
      });
      
      // Update memory cache
      memoryCache.config = mergedConfig;
      memoryCache.timestamp = Date.now();
      memoryCache.version = remoteConfig.version;
      
      const duration = Date.now() - startTime;
      console.log(`[AutoPlay] Config synced successfully. Version: ${remoteConfig.version || 'unknown'} (${duration}ms)`);
      
      // Send success telemetry
      this.sendTelemetry('config_sync_success', {
        success: true,
        duration,
        retryCount,
        version: remoteConfig.version,
        platformCount: Object.keys(validatedPlatforms).length
      });
      
      return mergedConfig;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.warn("[AutoPlay] Sync failed, using cached/defaults:", error.message);
      
      // Send failure telemetry
      this.sendTelemetry('config_sync_failure', {
        success: false,
        duration,
        retryCount,
        errorType: error.name,
        errorMessage: error.message
      });
      
      // Try to return cached config from storage
      const data = await chrome.storage.local.get(['selectorConfig']);
      return data.selectorConfig || null;
    }
  }

  static async getSelectors(platformKey) {
    try {
      // Check memory cache first (fastest)
      if (memoryCache.config && memoryCache.config[platformKey]) {
        const age = Date.now() - (memoryCache.timestamp || 0);
        if (age < CONFIG_MANAGER_SETTINGS.CACHE_MAX_AGE) {
          return memoryCache.config[platformKey];
        }
      }
      
      // Read from storage
      const data = await chrome.storage.local.get(['selectorConfig']);
      
      if (data.selectorConfig) {
        // Update memory cache
        memoryCache.config = data.selectorConfig;
        memoryCache.timestamp = Date.now();
        
        if (data.selectorConfig[platformKey]) {
          return data.selectorConfig[platformKey];
        }
      }
      
      // Fallback to defaults
      console.log(`[AutoPlay] Using default selectors for ${platformKey}`);
      return DEFAULT_CONFIG[platformKey] || {};
    } catch (error) {
      console.warn('[AutoPlay] Failed to get selectors:', error.message);
      return DEFAULT_CONFIG[platformKey] || {};
    }
  }

  /**
   * Check if config needs refresh (older than 24 hours)
   * Now includes optional force-check against current version
   */
  static async needsRefresh(forceCheckVersion = false) {
    try {
      const data = await chrome.storage.local.get(['lastSynced', 'configVersion']);
      
      if (!data.lastSynced) {
        return true;
      }
      
      // Check age
      const age = Date.now() - data.lastSynced;
      if (age > CONFIG_MANAGER_SETTINGS.CACHE_MAX_AGE) {
        return true;
      }
      
      // Optionally check server version
      if (forceCheckVersion && data.configVersion) {
        try {
          const response = await this.fetchWithTimeout(CONFIG_MANAGER_SETTINGS.API_URL);
          const remoteConfig = await response.json();
          if (remoteConfig.version && remoteConfig.version !== data.configVersion) {
            console.log(`[AutoPlay] New config version available: ${remoteConfig.version}`);
            return true;
          }
        } catch {
          // Network error - assume doesn't need refresh
          return false;
        }
      }
      
      return false;
    } catch {
      return true;
    }
  }
  
  /**
   * Clear memory cache (useful for testing or forcing refresh)
   */
  static clearCache() {
    memoryCache = {
      config: null,
      timestamp: null,
      version: null
    };
    console.log('[AutoPlay] Memory cache cleared');
  }
  
  /**
   * Get current config version
   */
  static async getVersion() {
    if (memoryCache.version) {
      return memoryCache.version;
    }
    const data = await chrome.storage.local.get(['configVersion']);
    return data.configVersion || 'unknown';
  }
  
  /**
   * Send telemetry to server (batched to prevent spam)
   */
  static sendTelemetry(event, data) {
    // Add to queue
    telemetryQueue.push({
      event,
      data,
      timestamp: Date.now()
    });
    
    // Flush immediately if batch is full
    if (telemetryQueue.length >= CONFIG_MANAGER_SETTINGS.TELEMETRY.MAX_BATCH_SIZE) {
      this.flushTelemetry();
      return;
    }
    
    // Otherwise, schedule batch flush after delay
    if (!telemetryFlushTimer) {
      telemetryFlushTimer = setTimeout(() => {
        this.flushTelemetry();
      }, CONFIG_MANAGER_SETTINGS.TELEMETRY.BATCH_DELAY);
    }
  }
  
  /**
   * Flush telemetry queue (internal)
   */
  static flushTelemetry() {
    if (telemetryFlushTimer) {
      clearTimeout(telemetryFlushTimer);
      telemetryFlushTimer = null;
    }
    
    if (telemetryQueue.length === 0) return;
    
    const eventsToSend = [...telemetryQueue];
    telemetryQueue = [];
    
    // Fire and forget - don't block extension operation
    (async () => {
      try {
        const manifest = chrome.runtime.getManifest();
        await fetch(CONFIG_MANAGER_SETTINGS.TELEMETRY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: eventsToSend,
            extensionVersion: manifest.version,
            batchTimestamp: Date.now()
          })
        });
      } catch (error) {
        // Silent fail - telemetry should never break extension
        console.debug('[AutoPlay] Telemetry batch failed (non-critical):', error.message);
      }
    })();
  }
}