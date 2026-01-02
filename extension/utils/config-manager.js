// Hardcoded defaults in case the server is down
const DEFAULT_CONFIG = {
  netflix: {
    nextButton: "[data-uia='next-episode-seamless-button']",
    skipIntroButton: "[data-uia='player-skip-intro']"
  },
  youtube: {
    skipAdButton: ".ytp-ad-skip-button"
  }
};

// TODO: REPLACE THIS URL AFTER DEPLOYING PHASE 1
const API_URL = "https://viboot-api.onrender.com/api/selectors";

export class ConfigManager {
  static async syncConfig() {
    try {
      console.log("Viboot: Syncing remote selectors...");
      const response = await fetch(API_URL);
      
      if (!response.ok) throw new Error("Config fetch failed");
      
      const remoteConfig = await response.json();
      
      await chrome.storage.local.set({ 
        selectorConfig: remoteConfig.platforms,
        lastSynced: Date.now()
      });
      
      console.log("Viboot: Config synced successfully.");
      return remoteConfig.platforms;
    } catch (error) {
      console.warn("Viboot: Sync failed, using defaults.", error);
      return null; 
    }
  }

  static async getSelectors(platformKey) {
    const data = await chrome.storage.local.get(['selectorConfig']);
    
    if (data.selectorConfig && data.selectorConfig[platformKey]) {
      return data.selectorConfig[platformKey];
    }
    
    return DEFAULT_CONFIG[platformKey] || {};
  }
}