/**
 * Viboot Timer Engine v2
 * Core timer logic that runs in background service worker
 * 
 * Key improvements:
 * - Uses chrome.alarms for MV3 service worker compatibility (survives SW sleep)
 * - Handles tab close gracefully
 * - Better error handling throughout
 * - Optimized storage writes
 */

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const TIMER_CONFIG = {
  TICK_INTERVAL: 1000,              // 1 second - countdown tick interval
  ALARM_TICK_PERIOD: 0.5,           // 0.5 minutes - chrome.alarms tick period
  SAVE_STATE_INTERVAL: 10,          // 10 seconds - how often to save timer state
  BADGE_UPDATE_INTERVAL: 60,        // 60 seconds - how often to update badge
  BROADCAST_THROTTLE: 2000,         // 2 seconds - minimum time between broadcasts (reduced spam)
  MIN_DURATION: 1,                  // 1 second - minimum timer duration
  MAX_DURATION: 86400               // 24 hours - maximum timer duration
};

export class SleepTimerEngine {
  constructor() {
    this.activeTimer = null;
    this.intervalId = null;
    this.lastBroadcast = 0;
    this.lastBroadcastRemaining = -1; // Track last broadcasted time to avoid spam
    this.shouldBroadcast = true; // Control broadcast during countdown (false = suppress)
    this.isExpiring = false; // Prevent multiple expiration calls
    this.isTicking = false; // Prevent overlapping ticks
    this.isRestoring = false; // Prevent concurrent restoration
    this.expirationLock = false; // Atomic lock for expiration (prevents race between tick and alarm)
    this.lastExpirationTime = 0; // Timestamp deduplication - prevent multiple expirations within 5s window
    
    // Set up tab close listener
    this.setupTabListener();
  }
  
  /**
   * Listen for tab close events
   */
  setupTabListener() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.activeTimer && this.activeTimer.tabId === tabId) {
        console.log('[Viboot] Timer tab was closed, stopping timer');
        this.stopTimer();
      }
    });
  }
  
  /**
   * Start a new sleep timer
   */
  async startTimer(minutes, tabId) {
    try {
      const durationSeconds = Math.round(minutes * 60);
      
      console.log('[Viboot] Starting timer for ' + durationSeconds + 's on tab ' + tabId);
      
      if (durationSeconds < TIMER_CONFIG.MIN_DURATION || durationSeconds > TIMER_CONFIG.MAX_DURATION) {
        throw new Error('Timer must be between 1 second and 24 hours');
      }
      
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (e) {
        throw new Error('Tab not found or inaccessible');
      }
      
      await this.stopTimer();
      
      const platform = this.detectPlatform(tab.url);
      
      this.activeTimer = {
        tabId: tabId,
        platform: platform,
        duration: durationSeconds,
        remaining: durationSeconds,
        startTime: Date.now(),
        status: 'active'
      };
      
      await chrome.storage.local.set({ activeTimer: this.activeTimer });
      
      // Use chrome.alarms for SW sleep resilience
      await chrome.alarms.create('vibootTimerTick', { periodInMinutes: TIMER_CONFIG.ALARM_TICK_PERIOD });
      await chrome.alarms.create('vibootTimerExpiry', { 
        when: Date.now() + (durationSeconds * 1000) 
      });
      
      this.notifyContentScript(tabId, { action: 'timerStarted' });
      this.startCountdown();
      
      // Send initial broadcast, then suppress until timer expires
      this.shouldBroadcast = true;
      this.updateBadge();
      this.broadcastTimerUpdate();
      this.shouldBroadcast = false; // Suppress broadcasts during countdown
      
      return this.activeTimer;
      
    } catch (error) {
      console.error('[Viboot] Failed to start timer:', error);
      throw error;
    }
  }
  
  startCountdown() {
    if (this.intervalId) clearInterval(this.intervalId);
    
    this.intervalId = setInterval(() => {
      // Non-async wrapper to prevent timing issues
      this.tick().catch(e => console.error('[Viboot] Tick error:', e));
    }, TIMER_CONFIG.TICK_INTERVAL);
  }
  
  async tick() {
    // Prevent overlapping ticks and check state
    if (!this.activeTimer || this.isExpiring || this.isTicking || this.activeTimer.status === 'paused') {
      this.isTicking = false;
      return;
    }
    this.isTicking = true;
    
    try {
      this.activeTimer.remaining--;
    
    // Broadcast update first so UI shows current time (including 0)
    this.broadcastTimerUpdate();
    
    // Then check for expiration using centralized method
    if (this.activeTimer.remaining <= 0) {
      // Stop the interval immediately
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      await this.checkAndExpireIfNeeded();
      return;
    }
    
    // Only save state periodically (using configured interval)
    if (this.activeTimer.remaining % TIMER_CONFIG.SAVE_STATE_INTERVAL === 0) {
      this.saveTimerState().catch(e => console.warn('[Viboot] Save error:', e));
    }
    
    // Update badge at configured interval
    if (this.activeTimer.remaining % TIMER_CONFIG.BADGE_UPDATE_INTERVAL === 0) {
      this.updateBadge();
    }
    
    } finally {
      this.isTicking = false;
    }
  }
  
  async handleAlarm(alarmName) {
    if (alarmName === 'vibootTimerTick') {
      // Don't sync if we're in the middle of expiring
      if (!this.isExpiring) {
        await this.syncTimerState();
      }
    } else if (alarmName === 'vibootTimerExpiry') {
      // Direct expiration alarm - use centralized check
      await this.checkAndExpireIfNeeded();
    }
  }
  
  async syncTimerState() {
    // Don't sync during expiration or if countdown is actively running
    if (this.isExpiring || this.intervalId) return;
    
    const result = await chrome.storage.local.get('activeTimer');
    
    if (!result.activeTimer || result.activeTimer.status !== 'active') {
      await this.cleanup();
      return;
    }
    
    const saved = result.activeTimer;
    const elapsed = Math.floor((Date.now() - saved.startTime) / 1000);
    const remaining = saved.duration - elapsed;
    
    if (remaining <= 0) {
      this.activeTimer = saved;
      this.activeTimer.remaining = 0;
      await this.onTimerExpire();
    } else {
      this.activeTimer = { ...saved, remaining: remaining };
      // Only start countdown if not paused
      if (this.activeTimer.status !== 'paused' && !this.intervalId) {
        this.startCountdown();
      }
      this.updateBadge();
      this.broadcastTimerUpdate();
    }
  }
  
  async saveTimerState() {
    if (!this.activeTimer) return;
    try {
      await chrome.storage.local.set({ activeTimer: this.activeTimer });
    } catch (error) {
      console.error('[Viboot] Failed to save timer state:', error);
    }
  }
  
  /**
   * Save last timer info for display in popup footer
   */
  async saveLastTimerInfo() {
    if (!this.activeTimer) return;
    
    try {
      let siteName = this.activeTimer.platform || 'Unknown';
      let site = '';
      
      // Try to get actual site from tab
      try {
        const tab = await chrome.tabs.get(this.activeTimer.tabId);
        if (tab?.url) {
          const url = new URL(tab.url);
          site = url.hostname;
          siteName = this.getSiteDisplayName(url.hostname);
        }
      } catch (e) {
        // Tab may not exist, use platform name
        siteName = this.activeTimer.platform || 'Unknown';
      }
      
      const lastTimer = {
        endTime: Date.now(),
        site: site,
        siteName: siteName,
        duration: this.activeTimer.duration
      };
      
      await chrome.storage.local.set({ lastTimer });
      console.log('[Viboot] Saved last timer info:', lastTimer);
    } catch (error) {
      console.warn('[Viboot] Failed to save last timer info:', error);
    }
  }
  
  /**
   * Get display name for a hostname
   */
  getSiteDisplayName(hostname) {
    const platformNames = {
      'netflix.com': 'Netflix',
      'youtube.com': 'YouTube',
      'disneyplus.com': 'Disney+',
      'hbomax.com': 'HBO Max',
      'max.com': 'Max',
      'amazon.com': 'Prime Video',
      'primevideo.com': 'Prime Video',
      'hulu.com': 'Hulu',
      'crunchyroll.com': 'Crunchyroll',
      'twitch.tv': 'Twitch'
    };
    
    for (const [domain, name] of Object.entries(platformNames)) {
      if (hostname.includes(domain)) return name;
    }
    
    return hostname.replace(/^www\./, '').split('.')[0];
  }
  
  /**
   * Centralized expiration check - single source of truth
   * All expiration paths should call this method
   */
  async checkAndExpireIfNeeded() {
    // Skip if no timer or already expiring
    if (!this.activeTimer || this.isExpiring) {
      return;
    }
    
    // Calculate actual remaining time from start time
    const elapsed = Math.floor((Date.now() - this.activeTimer.startTime) / 1000);
    const calculatedRemaining = this.activeTimer.duration - elapsed;
    
    // Only expire if we're actually at or past expiration time
    if (calculatedRemaining <= 0) {
      this.activeTimer.remaining = 0;
      await this.onTimerExpire();
    }
  }
  
  async onTimerExpire() {
    // Timestamp deduplication - prevent multiple expirations within 5 second window
    const now = Date.now();
    if (now - this.lastExpirationTime < 5000) {
      console.log('[Viboot] Expiration already handled recently (within 5s), skipping duplicate');
      return;
    }
    this.lastExpirationTime = now;
    
    // Atomic lock - prevent multiple simultaneous expiration calls (race between tick and alarm)
    if (this.expirationLock || this.isExpiring) {
      console.log('[Viboot] Timer expiration already in progress, skipping');
      return;
    }
    this.expirationLock = true;
    this.isExpiring = true;
    
    console.log('[Viboot] Timer expired! Pausing video...');
    
    // Re-enable broadcasts for expiration notification
    this.shouldBroadcast = true;
    
    if (!this.activeTimer) {
      this.isExpiring = false;
      await this.finalCleanup();
      return;
    }
    
    const tabId = this.activeTimer.tabId;
    
    // IMMEDIATE alarm clearing - prevent any other paths from triggering
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await chrome.alarms.clear('vibootTimerTick');
    await chrome.alarms.clear('vibootTimerExpiry');
    
    // Save last timer info after clearing alarms
    await this.saveLastTimerInfo();
    
    try {
      // Check if tab exists in this browser
      await chrome.tabs.get(tabId);
      
      // Tab exists, pause video
      await this.pauseVideo(tabId);
      await this.showExpiryNotification();
      
      setTimeout(() => {
        this.notifyContentScript(tabId, { action: 'destroyOverlay' }).catch(() => {});
      }, 2000);
      
    } catch (e) {
      // Tab doesn't exist in this browser - that's OK, just show notification
      console.log('[Viboot] Timer tab not found in this browser context');
      await this.showExpiryNotification();
    }
    
    // Wait 1 second before resetting
    setTimeout(async () => {
      await this.finalCleanup();
      this.isExpiring = false;
      this.expirationLock = false;
    }, 1000);
  }
  
  async stopTimer() {
    console.log('[Viboot] Stopping timer');
    this.isExpiring = false; // Reset flag in case we're stopping during expiration
    this.expirationLock = false; // Reset atomic lock
    const tabId = this.activeTimer?.tabId;
    this.cleanup();
    if (tabId) this.notifyContentScript(tabId, { action: 'destroyOverlay' }).catch(() => {});
    await this.finalCleanup();
  }
  
  cleanup() {
    this.isExpiring = false;
    this.isTicking = false;
    this.expirationLock = false;
    this.shouldBroadcast = true; // Reset for next timer
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    chrome.alarms.clear('vibootTimerTick');
    chrome.alarms.clear('vibootTimerExpiry');
  }
  
  async finalCleanup() {
    this.activeTimer = null;
    try {
      await chrome.storage.local.remove('activeTimer');
      await chrome.action.setBadgeText({ text: '' });
    } catch (error) {
      console.error('[Viboot] Cleanup error:', error);
    }
  }
  
  async extendTimer(additionalMinutes) {
    if (!this.activeTimer) throw new Error('No active timer to extend');
    
    const additionalSeconds = Math.round(additionalMinutes * 60);
    this.activeTimer.remaining += additionalSeconds;
    this.activeTimer.duration += additionalSeconds;
    
    await chrome.alarms.clear('vibootTimerExpiry');
    await chrome.alarms.create('vibootTimerExpiry', {
      when: Date.now() + (this.activeTimer.remaining * 1000)
    });
    
    await this.saveTimerState();
    this.updateBadge();
    
    // Broadcast extension immediately, then suppress again
    this.shouldBroadcast = true;
    this.broadcastTimerUpdate();
    this.shouldBroadcast = false;
    
    console.log('[Viboot] Timer extended by ' + additionalMinutes + ' minutes');
    return this.activeTimer;
  }
  
  async pauseTimer() {
    if (!this.activeTimer) throw new Error('No active timer to pause');
    if (this.activeTimer.status === 'paused') {
      return this.activeTimer;
    }
    
    console.log('[Viboot] Pausing timer');
    
    // Stop countdown
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Clear alarms
    await chrome.alarms.clear('vibootTimerTick');
    await chrome.alarms.clear('vibootTimerExpiry');
    
    // Update status
    this.activeTimer.status = 'paused';
    this.activeTimer.pausedAt = Date.now();
    
    await this.saveTimerState();
    this.updateBadge();
    this.broadcastTimerUpdate();
    
    return this.activeTimer;
  }
  
  async resumeTimer() {
    if (!this.activeTimer) throw new Error('No active timer to resume');
    if (this.activeTimer.status !== 'paused') return this.activeTimer;
    
    console.log('[Viboot] Resuming timer');
    
    // Update status
    this.activeTimer.status = 'active';
    this.activeTimer.startTime = Date.now() - ((this.activeTimer.duration - this.activeTimer.remaining) * 1000);
    delete this.activeTimer.pausedAt;
    
    // Restart alarms
    await chrome.alarms.create('vibootTimerTick', { periodInMinutes: TIMER_CONFIG.ALARM_TICK_PERIOD });
    await chrome.alarms.create('vibootTimerExpiry', { 
      when: Date.now() + (this.activeTimer.remaining * 1000) 
    });
    
    await this.saveTimerState();
    this.startCountdown();
    this.updateBadge();
    this.broadcastTimerUpdate();
    
    return this.activeTimer;
  }
  
  async getTimerStatus() {
    // Always read from storage for accuracy across multiple popups
    // This doesn't start the countdown - just returns status
    try {
      const result = await chrome.storage.local.get('activeTimer');
      const saved = result.activeTimer;
      
      if (!saved) {
        return { active: false };
      }
      
      let remaining;
      
      // If paused, use the saved remaining time (don't calculate)
      if (saved.status === 'paused') {
        remaining = saved.remaining;
      } else {
        // Calculate remaining time based on start time for active timers
        const elapsed = Math.floor((Date.now() - saved.startTime) / 1000);
        remaining = Math.max(0, saved.duration - elapsed);
      }
      
      // Return inactive only if timer has expired AND been cleaned up
      // This allows the UI to display 0 before expiration
      if (remaining < 0 || !this.activeTimer) {
        return { active: false };
      }
      
      // Update in-memory state if not already set (lazy restoration)
      if (!this.activeTimer && !this.isRestoring) {
        // Trigger restoration in background (don't await to avoid blocking)
        this.restoreTimer().catch(e => console.warn('[Viboot] Background restore failed:', e));
      } else if (this.activeTimer) {
        // Keep in-memory value in sync
        this.activeTimer.remaining = remaining;
      }
      
      return {
        active: true,
        status: saved.status || 'active',
        remaining: remaining,
        duration: saved.duration,
        platform: saved.platform,
        tabId: saved.tabId,
        minutesRemaining: Math.ceil(remaining / 60)
      };
    } catch (error) {
      console.error('[Viboot] Failed to get timer status:', error);
      return { active: false };
    }
  }
  
  async pauseVideo(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'pauseVideo', source: 'sleepTimer' });
      console.log('[Viboot] Video paused successfully');
    } catch (error) {
      // Content script not available - use fallback silently
      console.log('[Viboot] Content script unavailable, using fallback');
      await this.pauseVideoFallback(tabId);
    }
  }
  
  async pauseVideoFallback(tabId) {
    try {
      // Get tab info to check URL
      const tab = await chrome.tabs.get(tabId);
      
      // Don't try to pause on chrome://, about:, or other restricted URLs
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
        console.log('[Viboot] Skipping pause on restricted URL:', tab.url);
        return;
      }
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => { document.querySelectorAll('video').forEach(v => v.pause()); }
      });
      console.log('[Viboot] Video paused via fallback');
    } catch (error) {
      console.warn('[Viboot] Fallback pause failed:', error.message);
    }
  }
  
  async showExpiryNotification() {
    try {
      const settings = await this.getSettings();
      if (!settings.showNotifications) return;
      
      await chrome.notifications.create('vibootExpired', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/android-chrome-192x192.png'),
        title: 'Sleep Timer Expired',
        message: 'Your video has been paused. Sweet dreams!',
        priority: 2
      });
    } catch (error) {
      console.log('[Viboot] Notification failed:', error);
    }
  }
  
  updateBadge() {
    if (!this.activeTimer) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    
    const minutes = Math.ceil(this.activeTimer.remaining / 60);
    let badgeText = minutes > 99 ? '99+' : minutes > 0 ? String(minutes) : '<1';
    
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  }
  
  broadcastTimerUpdate() {
    // Suppress broadcasts during active countdown (overlay handles countdown locally)
    if (!this.shouldBroadcast) return;
    
    const now = Date.now();
    if (now - this.lastBroadcast < TIMER_CONFIG.BROADCAST_THROTTLE) return;
    
    // Only broadcast if remaining time actually changed
    if (this.activeTimer?.remaining === this.lastBroadcastRemaining) return;
    
    this.lastBroadcast = now;
    this.lastBroadcastRemaining = this.activeTimer?.remaining ?? -1;
    
    chrome.runtime.sendMessage({
      action: 'timerUpdate',
      status: this.getTimerStatus()
    }).catch(() => {});
    
    if (this.activeTimer?.tabId) {
      this.notifyContentScript(this.activeTimer.tabId, {
        action: 'updateOverlay',
        remaining: this.activeTimer.remaining
      });
    }
  }
  
  notifyContentScript(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message).catch(() => {});
  }
  
  detectPlatform(url) {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes('netflix.com')) return 'netflix';
      if (hostname.includes('primevideo.com') || hostname.includes('amazon.com')) return 'amazon';
      if (hostname.includes('disneyplus.com')) return 'disney';
      if (hostname.includes('youtube.com')) return 'youtube';
      if (hostname.includes('crunchyroll.com')) return 'crunchyroll';
      if (hostname.includes('hbomax.com') || hostname.includes('max.com')) return 'hbo';
      if (hostname.includes('twitch.tv')) return 'twitch';
      if (hostname.includes('hulu.com')) return 'hulu';
      return 'generic';
    } catch { return 'generic'; }
  }
  
  async getSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      return result.settings || { showNotifications: true, showOverlay: true, defaultTimer: 30 };
    } catch { return { showNotifications: true, showOverlay: true, defaultTimer: 30 }; }
  }
  
  async restoreTimer() {
    // Prevent race condition: don't restore if timer is already active, currently expiring, or already restoring
    if (this.activeTimer || this.isExpiring || this.isRestoring) {
      console.log('[Viboot] Timer already active/restoring, skipping restore');
      return this.activeTimer;
    }
    
    this.isRestoring = true;
    
    try {
      const result = await chrome.storage.local.get('activeTimer');
      
      if (!result.activeTimer || result.activeTimer.status !== 'active') {
        this.isRestoring = false;
        return null;
      }
      
      const saved = result.activeTimer;
      
      try {
        await chrome.tabs.get(saved.tabId);
      } catch (e) {
        console.log('[Viboot] Timer tab no longer exists');
        await this.finalCleanup();
        this.isRestoring = false;
        return null;
      }
      
      const elapsed = Math.floor((Date.now() - saved.startTime) / 1000);
      const remaining = saved.duration - elapsed;
      
      if (remaining <= 0) {
        this.activeTimer = { ...saved, remaining: 0 };
        await this.checkAndExpireIfNeeded();
        this.isRestoring = false;
        return null;
      }
      
      this.activeTimer = { ...saved, remaining: remaining };
      
      await chrome.alarms.create('vibootTimerTick', { periodInMinutes: TIMER_CONFIG.ALARM_TICK_PERIOD });
      await chrome.alarms.create('vibootTimerExpiry', { when: Date.now() + (remaining * 1000) });
      
      this.startCountdown();
      this.updateBadge();
      
      // Send broadcast on restoration, then suppress
      this.shouldBroadcast = true;
      this.broadcastTimerUpdate();
      this.shouldBroadcast = false;
      
      console.log('[Viboot] Timer restored: ' + Math.ceil(remaining / 60) + ' min remaining');
      this.isRestoring = false;
      return this.activeTimer;
      
    } catch (error) {
      console.error('[Viboot] Failed to restore timer:', error);
      this.isRestoring = false;
      return null;
    }
  }
}

export const timerEngine = new SleepTimerEngine();
