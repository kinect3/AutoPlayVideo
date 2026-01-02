/**
 * Viboot Timer Engine
 * Core timer logic that runs in background service worker
 */

export class SleepTimerEngine {
  constructor() {
    this.activeTimer = null;
    this.intervalId = null;
  }
  
  /**
   * Start a new sleep timer
   * @param {number} minutes - Timer duration in minutes (supports decimals, e.g., 0.5 for 30 seconds)
   * @param {number} tabId - Chrome tab ID
   */
  async startTimer(minutes, tabId) {
    // Convert to seconds (supports fractional minutes for second-level precision)
    const durationSeconds = Math.round(minutes * 60);
    
    console.log(`[Viboot] Starting timer for ${durationSeconds} seconds (${minutes} min) on tab ${tabId}`);
    
    // Validate input: 1 second to 24 hours
    if (durationSeconds < 1 || durationSeconds > 86400) {
      throw new Error('Timer must be between 1 second and 24 hours');
    }
    
    // Stop any existing timer
    await this.stopTimer();
    
    // Get tab info
    const tab = await chrome.tabs.get(tabId);
    const platform = this.detectPlatform(tab.url);
    
    // Create timer state
    this.activeTimer = {
      tabId: tabId,
      platform: platform,
      duration: durationSeconds,
      remaining: durationSeconds,
      startTime: Date.now(),
      status: 'active'
    };
    
    // Save to storage (persist across browser restarts)
    await chrome.storage.local.set({ activeTimer: this.activeTimer });
    
    // Notify the content script that a new timer has started (resets pause flag)
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'timerStarted' });
    } catch (e) {
      // Content script might not be loaded yet, that's ok
      console.log('[Viboot] Could not notify content script of timer start');
    }
    
    // Start countdown
    this.startCountdown();
    
    // Update badge
    this.updateBadge();
    
    return this.activeTimer;
  }
  
  /**
   * Main countdown loop
   */
  startCountdown() {
    this.intervalId = setInterval(async () => {
      if (!this.activeTimer) {
        clearInterval(this.intervalId);
        return;
      }
      
      // Decrement remaining time
      this.activeTimer.remaining--;
      
      // Update storage every 10 seconds (reduce write frequency)
      if (this.activeTimer.remaining % 10 === 0) {
        await chrome.storage.local.set({ activeTimer: this.activeTimer });
      }
      
      // Update badge every minute
      if (this.activeTimer.remaining % 60 === 0) {
        this.updateBadge();
      }
      
      // Check if timer expired
      if (this.activeTimer.remaining <= 0) {
        await this.onTimerExpire();
      }
      
      // Send update to popup (if open)
      this.broadcastTimerUpdate();
      
    }, 1000); // Tick every second
  }
  
  /**
   * Timer expiration handler
   */
  async onTimerExpire() {
    console.log('[Viboot] Timer expired! Pausing video...');
    
    // Stop countdown
    clearInterval(this.intervalId);
    this.intervalId = null;
    
    const tabId = this.activeTimer.tabId;
    
    // Pause video on the tab
    await this.pauseVideo(tabId);
    
    // Show notification
    await this.showExpiryNotification();
    
    // Hide overlay after a short delay (so user sees it hit 0)
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'destroyOverlay' });
      } catch (e) {
        // Tab might be closed
      }
    }, 2000);
    
    // Update timer status
    this.activeTimer.status = 'expired';
    await chrome.storage.local.set({ activeTimer: this.activeTimer });
    
    // Clear badge
    chrome.action.setBadgeText({ text: '' });
    
    // Clean up
    this.activeTimer = null;
    await chrome.storage.local.remove('activeTimer');
  }
  
  /**
   * Stop/cancel active timer
   */
  async stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.activeTimer) {
      const tabId = this.activeTimer.tabId;
      console.log('[Viboot] Timer stopped');
      
      // Notify content script to hide overlay
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'destroyOverlay' });
      } catch (e) {
        // Tab might be closed
      }
      
      this.activeTimer = null;
      await chrome.storage.local.remove('activeTimer');
      chrome.action.setBadgeText({ text: '' });
    }
  }
  
  /**
   * Extend timer by X minutes
   */
  async extendTimer(additionalMinutes) {
    if (!this.activeTimer) {
      throw new Error('No active timer to extend');
    }
    
    this.activeTimer.remaining += additionalMinutes * 60;
    this.activeTimer.duration += additionalMinutes * 60;
    
    await chrome.storage.local.set({ activeTimer: this.activeTimer });
    this.updateBadge();
    
    console.log(`[Viboot] Timer extended by ${additionalMinutes} minutes`);
    
    return this.activeTimer;
  }
  
  /**
   * Get current timer status
   */
  getTimerStatus() {
    if (!this.activeTimer) {
      return { active: false };
    }
    
    return {
      active: true,
      remaining: this.activeTimer.remaining,
      duration: this.activeTimer.duration,
      platform: this.activeTimer.platform,
      tabId: this.activeTimer.tabId,
      minutesRemaining: Math.ceil(this.activeTimer.remaining / 60)
    };
  }
  
  /**
   * Pause video on target tab
   */
  async pauseVideo(tabId) {
    try {
      // Content script is already loaded via manifest, just send message
      await chrome.tabs.sendMessage(tabId, {
        action: 'pauseVideo',
        source: 'sleepTimer'
      });
      
      console.log('[Viboot] Video paused successfully');
      
    } catch (error) {
      console.error('[Viboot] Failed to pause video:', error);
      // Fallback: try direct script execution
      await this.pauseVideoFallback(tabId);
    }
  }
  
  /**
   * Fallback pause method using direct script execution
   */
  async pauseVideoFallback(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const videos = document.querySelectorAll('video');
          videos.forEach(video => video.pause());
        }
      });
      console.log('[Viboot] Video paused via fallback');
    } catch (error) {
      console.error('[Viboot] Fallback pause failed:', error);
    }
  }
  
  /**
   * Show browser notification
   */
  async showExpiryNotification() {
    const settings = await this.getSettings();
    
    if (!settings.showNotifications) return;
    
    try {
      await chrome.notifications.create('timerExpired', {
        type: 'basic',
        title: '😴 Sleep Timer Expired',
        message: 'Your video has been paused. Sweet dreams!',
        priority: 2
      });
    } catch (error) {
      console.log('[Viboot] Notification failed:', error);
    }
  }
  
  /**
   * Update extension badge with remaining time
   */
  updateBadge() {
    if (!this.activeTimer) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    
    const minutes = Math.ceil(this.activeTimer.remaining / 60);
    let badgeText;
    
    if (minutes > 99) {
      badgeText = '99+';
    } else if (minutes > 0) {
      badgeText = String(minutes);
    } else {
      badgeText = '<1';
    }
    
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); // Indigo
  }
  
  /**
   * Broadcast timer update to popup
   */
  broadcastTimerUpdate() {
    // Update popup
    chrome.runtime.sendMessage({
      action: 'timerUpdate',
      status: this.getTimerStatus()
    }).catch(() => {
      // Popup not open, ignore
    });
    
    // Update overlay on the target tab
    if (this.activeTimer?.tabId) {
      chrome.tabs.sendMessage(this.activeTimer.tabId, {
        action: 'updateOverlay',
        remaining: this.activeTimer.remaining
      }).catch(() => {
        // Tab might not be accessible
      });
    }
  }
  
  /**
   * Detect platform from URL
   */
  detectPlatform(url) {
    try {
      const hostname = new URL(url).hostname;
      
      if (hostname.includes('netflix.com')) return 'netflix';
      if (hostname.includes('primevideo.com') || hostname.includes('amazon.com')) return 'amazon';
      if (hostname.includes('disneyplus.com')) return 'disney';
      if (hostname.includes('youtube.com')) return 'youtube';
      if (hostname.includes('crunchyroll.com')) return 'crunchyroll';
      if (hostname.includes('hbomax.com') || hostname.includes('max.com')) return 'hbo';
      
      return 'generic';
    } catch {
      return 'generic';
    }
  }
  
  /**
   * Get user settings
   */
  async getSettings() {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {
      showNotifications: true,
      showOverlay: true,
      defaultTimer: 30
    };
  }
  
  /**
   * Restore timer on browser restart
   */
  async restoreTimer() {
    const result = await chrome.storage.local.get('activeTimer');
    
    if (!result.activeTimer || result.activeTimer.status === 'expired') {
      return null;
    }
    
    const savedTimer = result.activeTimer;
    
    // Calculate elapsed time since timer was saved
    const elapsedSeconds = Math.floor((Date.now() - savedTimer.startTime) / 1000);
    const remainingSeconds = savedTimer.duration - elapsedSeconds;
    
    if (remainingSeconds > 0) {
      // Timer still valid, restore it
      this.activeTimer = {
        ...savedTimer,
        remaining: remainingSeconds
      };
      
      this.startCountdown();
      this.updateBadge();
      
      console.log(`[Viboot] Timer restored: ${Math.ceil(remainingSeconds / 60)} minutes remaining`);
      return this.activeTimer;
    } else {
      // Timer expired while browser was closed
      await chrome.storage.local.remove('activeTimer');
      return null;
    }
  }
}

// Export singleton instance
export const timerEngine = new SleepTimerEngine();