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

export class SleepTimerEngine {
  constructor() {
    this.activeTimer = null;
    this.intervalId = null;
    this.lastBroadcast = 0;
    this.isExpiring = false; // Prevent multiple expiration calls
    
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
      
      if (durationSeconds < 1 || durationSeconds > 86400) {
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
      await chrome.alarms.create('vibootTimerTick', { periodInMinutes: 0.5 });
      await chrome.alarms.create('vibootTimerExpiry', { 
        when: Date.now() + (durationSeconds * 1000) 
      });
      
      this.notifyContentScript(tabId, { action: 'timerStarted' });
      this.startCountdown();
      this.updateBadge();
      
      return this.activeTimer;
      
    } catch (error) {
      console.error('[Viboot] Failed to start timer:', error);
      throw error;
    }
  }
  
  startCountdown() {
    if (this.intervalId) clearInterval(this.intervalId);
    
    this.intervalId = setInterval(async () => {
      if (!this.activeTimer) {
        clearInterval(this.intervalId);
        this.intervalId = null;
        return;
      }
      
      this.activeTimer.remaining--;
      
      if (this.activeTimer.remaining % 10 === 0) {
        await this.saveTimerState();
      }
      
      if (this.activeTimer.remaining % 60 === 0) {
        this.updateBadge();
      }
      
      if (this.activeTimer.remaining <= 0) {
        await this.onTimerExpire();
        return;
      }
      
      this.broadcastTimerUpdate();
    }, 1000);
  }
  
  async handleAlarm(alarmName) {
    if (alarmName === 'vibootTimerTick') {
      // Don't sync if we're in the middle of expiring
      if (!this.isExpiring) {
        await this.syncTimerState();
      }
    } else if (alarmName === 'vibootTimerExpiry') {
      // Direct expiration alarm - always try to expire
      if (this.activeTimer && !this.isExpiring) {
        this.activeTimer.remaining = 0;
        await this.onTimerExpire();
      }
    }
  }
  
  async syncTimerState() {
    // Don't sync during expiration
    if (this.isExpiring) return;
    
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
      if (!this.intervalId) this.startCountdown();
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
  
  async onTimerExpire() {
    // Prevent multiple simultaneous expiration calls
    if (this.isExpiring) {
      console.log('[Viboot] Timer expiration already in progress, skipping');
      return;
    }
    this.isExpiring = true;
    
    console.log('[Viboot] Timer expired! Pausing video...');
    
    if (!this.activeTimer) {
      this.isExpiring = false;
      await this.finalCleanup();
      return;
    }
    
    const tabId = this.activeTimer.tabId;
    
    // Cleanup alarms but keep activeTimer reference until we're done
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    chrome.alarms.clear('vibootTimerTick');
    chrome.alarms.clear('vibootTimerExpiry');
    
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
    
    await this.finalCleanup();
    this.isExpiring = false;
  }
  
  async stopTimer() {
    console.log('[Viboot] Stopping timer');
    this.isExpiring = false; // Reset flag in case we're stopping during expiration
    const tabId = this.activeTimer?.tabId;
    this.cleanup();
    if (tabId) this.notifyContentScript(tabId, { action: 'destroyOverlay' }).catch(() => {});
    await this.finalCleanup();
  }
  
  cleanup() {
    this.isExpiring = false;
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
    
    console.log('[Viboot] Timer extended by ' + additionalMinutes + ' minutes');
    return this.activeTimer;
  }
  
  getTimerStatus() {
    if (!this.activeTimer) return { active: false };
    
    return {
      active: true,
      remaining: this.activeTimer.remaining,
      duration: this.activeTimer.duration,
      platform: this.activeTimer.platform,
      tabId: this.activeTimer.tabId,
      minutesRemaining: Math.ceil(this.activeTimer.remaining / 60)
    };
  }
  
  async pauseVideo(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'pauseVideo', source: 'sleepTimer' });
      console.log('[Viboot] Video paused successfully');
    } catch (error) {
      console.error('[Viboot] Failed to pause video:', error);
      await this.pauseVideoFallback(tabId);
    }
  }
  
  async pauseVideoFallback(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => { document.querySelectorAll('video').forEach(v => v.pause()); }
      });
      console.log('[Viboot] Video paused via fallback');
    } catch (error) {
      console.error('[Viboot] Fallback pause failed:', error);
    }
  }
  
  async showExpiryNotification() {
    try {
      const settings = await this.getSettings();
      if (!settings.showNotifications) return;
      
      await chrome.notifications.create('vibootExpired', {
        type: 'basic',
        iconUrl: 'assets/icons/android-chrome-192x192.png',
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
    const now = Date.now();
    if (now - this.lastBroadcast < 900) return;
    this.lastBroadcast = now;
    
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
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
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
    try {
      const result = await chrome.storage.local.get('activeTimer');
      
      if (!result.activeTimer || result.activeTimer.status !== 'active') return null;
      
      const saved = result.activeTimer;
      
      try {
        await chrome.tabs.get(saved.tabId);
      } catch (e) {
        console.log('[Viboot] Timer tab no longer exists');
        await this.finalCleanup();
        return null;
      }
      
      const elapsed = Math.floor((Date.now() - saved.startTime) / 1000);
      const remaining = saved.duration - elapsed;
      
      if (remaining <= 0) {
        this.activeTimer = { ...saved, remaining: 0 };
        await this.onTimerExpire();
        return null;
      }
      
      this.activeTimer = { ...saved, remaining: remaining };
      
      await chrome.alarms.create('vibootTimerTick', { periodInMinutes: 0.5 });
      await chrome.alarms.create('vibootTimerExpiry', { when: Date.now() + (remaining * 1000) });
      
      this.startCountdown();
      this.updateBadge();
      
      console.log('[Viboot] Timer restored: ' + Math.ceil(remaining / 60) + ' min remaining');
      return this.activeTimer;
      
    } catch (error) {
      console.error('[Viboot] Failed to restore timer:', error);
      return null;
    }
  }
}

export const timerEngine = new SleepTimerEngine();
