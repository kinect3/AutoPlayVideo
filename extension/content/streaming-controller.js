/**
 * AutoPlay Video Control - Streaming Controller
 * Unified content script for video playback control across all streaming platforms
 * Handles: video detection, pause/play, timer overlay, custom timer prompts
 */

// ============================================================================
// TIME UTILITIES (Inline copies from time-utils.js for content script context)
// ============================================================================

function parseTimeInput(input) {
  if (!input) return null;
  input = input.trim().toLowerCase();
  if (!input) return null;
  
  if (/^\d+(?:\.\d+)?$/.test(input)) {
    const seconds = parseFloat(input);
    return (seconds >= 1 && seconds <= 86400) ? Math.round(seconds) : null;
  }
  
  let totalSeconds = 0;
  const regex = /(\d+(?:\.\d+)?)\s*([smh])/g;
  const unitValues = { s: 1, m: 60, h: 3600 };
  let match;
  
  while ((match = regex.exec(input)) !== null) {
    totalSeconds += parseFloat(match[1]) * unitValues[match[2]];
  }
  
  if (totalSeconds < 1 || totalSeconds > 86400) return null;
  return Math.round(totalSeconds);
}

function formatSecondsToDisplay(totalSeconds) {
  if (totalSeconds < 60) return totalSeconds + 's';
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  
  let result = '';
  if (hours > 0) result += hours + 'h ';
  if (minutes > 0) result += minutes + 'm';
  if (seconds > 0 && hours === 0) result += (minutes > 0 ? ' ' : '') + seconds + 's';
  
  return result.trim() || '0s';
}

function formatCountdown(remaining) {
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const AUTOPLAY_CONFIG = {
  // Video cache settings
  VIDEO_CACHE_TTL: 10 * 1000,           // 10 seconds - how long to cache video element
  VIDEO_CACHE_THROTTLE: 250,            // 250ms - minimum time between cache queries
  
  // Overlay settings
  OVERLAY_UPDATE_THROTTLE: 800,         // 800ms - minimum time between overlay updates
  OVERLAY_SETTING_CACHE_TTL: 5000,      // 5 seconds - how long to cache overlay setting
  OVERLAY_WARNING_THRESHOLD: 300,       // 5 minutes - when to show warning state
  OVERLAY_CRITICAL_THRESHOLD: 60,       // 1 minute - when to show critical state
  
  // Notification settings
  NOTIFICATION_DURATION: 3000,          // 3 seconds - how long to show notifications
  
  // Video finding settings
  VIDEO_FIND_MAX_RETRIES: 5,            // Maximum retry attempts for finding video
  VIDEO_FIND_RETRY_BASE_DELAY: 500,     // Base delay between retries (ms)
  
  // Timer broadcast settings
  BROADCAST_THROTTLE: 900               // 900ms - minimum time between timer broadcasts
};

// ============================================================================
// UTILITIES
// ============================================================================

if (!window.AutoPlayUtils) {
  window.AutoPlayUtils = {
    parseCustomDuration: parseTimeInput,
    formatDuration: formatSecondsToDisplay,
    formatCountdown: formatCountdown
  };
}

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

if (!window.detectPlatform) {
  window.detectPlatform = function() {
    const url = window.location.href.toLowerCase();
    if (url.includes('crunchyroll')) return 'crunchyroll';
    if (url.includes('youtube')) return 'youtube';
    if (url.includes('netflix')) return 'netflix';
    if (url.includes('twitch')) return 'twitch';
    if (url.includes('primevideo') || url.includes('amazon.com/gp/video')) return 'prime';
    if (url.includes('disneyplus')) return 'disneyplus';
    if (url.includes('hulu')) return 'hulu';
    if (url.includes('max.com') || url.includes('hbomax')) return 'hbo';
    return 'generic';
  };
}

// ============================================================================
// PLATFORM STRATEGIES - Video finding and control per platform
// ============================================================================

if (!window.PlatformStrategies) {
  window.PlatformStrategies = {
    crunchyroll: {
      name: 'Crunchyroll',
      selectors: [
        'video',
        '.vilos-player video',
        '[class*="vilos"] video',
        '[id*="vilos"] video',
        '[class*="player"] video',
        '#player video'
      ],

      async findVideo() {
        const isInIframe = window.self !== window.top;
        const quickCheck = document.querySelector('video');

        // If we're in an iframe with no video, wait briefly then give up
        if (isInIframe && !quickCheck) {
          await new Promise(r => setTimeout(r, 500));
          if (!document.querySelector('video')) return null;
        }

        // Check for player container on main page
        if (!isInIframe && !quickCheck) {
          const hasPlayer = document.querySelector('[class*="player"], #player, [id*="vilos"]');
          if (!hasPlayer) return null;
          await new Promise(r => setTimeout(r, 500));
        }

        // Wait for video via MutationObserver
        const observed = await this.waitForVideo(2000);
        if (observed) return observed;

        // Fallback: traditional selector polling
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
          
          for (const sel of this.selectors) {
            const v = document.querySelector(sel);
            if (v && (v.duration || v.src || v.videoWidth > 0)) return v;
          }
          
          // Last resort: any video element
          const allVideos = document.querySelectorAll('video');
          if (allVideos.length > 0 && attempt >= 1) return allVideos[0];
        }

        return null;
      },

      async waitForVideo(timeout) {
        return new Promise(resolve => {
          const existing = document.querySelector('video');
          if (existing) { resolve(existing); return; }

          const observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (video) { observer.disconnect(); resolve(video); }
          });

          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
        });
      },

      async pause(video) {
        if (video && !video.paused) {
          await video.pause();
          return true;
        }
        return false;
      },

      async play(video) {
        if (video && video.paused) {
          await video.play();
          return true;
        }
        return false;
      }
    },

    youtube: {
      name: 'YouTube',
      selectors: ['.html5-video-player video', 'video', '#movie_player video'],

      async findVideo() {
        for (const sel of this.selectors) {
          const v = document.querySelector(sel);
          if (v && v.readyState >= 1) return v;
        }
        return null;
      },

      async pause(video) {
        // Try YouTube API first
        const player = document.querySelector('.html5-video-player');
        if (player?.pauseVideo) { player.pauseVideo(); return true; }
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        const player = document.querySelector('.html5-video-player');
        if (player?.playVideo) { player.playVideo(); return true; }
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    },

    netflix: {
      name: 'Netflix',
      selectors: ['[data-uia*="player"] video', '.watch-video--player-view video', 'video'],

      async findVideo() {
        // Try direct selectors first
        for (const sel of this.selectors) {
          try {
            const v = document.querySelector(sel);
            if (v && v.readyState >= 1) return v;
          } catch (e) { /* invalid selector */ }
        }
        // Wait for video with MutationObserver
        return this.waitForVideo(3000);
      },

      async waitForVideo(timeout) {
        return new Promise(resolve => {
          const existing = document.querySelector('video');
          if (existing && existing.readyState >= 1) { resolve(existing); return; }
          
          const observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (video && video.readyState >= 1) { observer.disconnect(); resolve(video); }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { observer.disconnect(); resolve(document.querySelector('video')); }, timeout);
        });
      },

      async pause(video) {
        // Try keyboard shortcut first (more reliable on Netflix)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        if (video.paused) return true;
        // Direct pause fallback
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    },

    twitch: {
      name: 'Twitch',
      selectors: ['[data-a-target*="player"] video', 'video'],

      async findVideo() {
        for (const sel of this.selectors) {
          const v = document.querySelector(sel);
          if (v && v.readyState >= 1) return v;
        }
        return null;
      },

      async pause(video) {
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    },

    prime: {
      name: 'Prime Video',
      selectors: ['[class*="webPlayer"] video', '[class*="PlayerVideo"] video', '[class*="video-player"] video', 'video'],

      async findVideo() {
        // Prime Video often loads video dynamically
        for (const sel of this.selectors) {
          try {
            const v = document.querySelector(sel);
            if (v && (v.readyState >= 1 || v.src)) return v;
          } catch (e) { /* invalid selector */ }
        }
        // Wait for video with MutationObserver
        return this.waitForVideo(3000);
      },

      async waitForVideo(timeout) {
        return new Promise(resolve => {
          const existing = document.querySelector('video');
          if (existing) { resolve(existing); return; }
          
          const observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (video) { observer.disconnect(); resolve(video); }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { observer.disconnect(); resolve(document.querySelector('video')); }, timeout);
        });
      },

      async pause(video) {
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    },

    disneyplus: {
      name: 'Disney+',
      selectors: ['video', '[class*="video-player"] video'],

      async findVideo() {
        const v = document.querySelector('video');
        return (v && v.readyState >= 1) ? v : null;
      },

      async pause(video) {
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    },

    hulu: {
      name: 'Hulu',
      selectors: ['[class*="video"] video', '[data-testid*="video"] video', 'video'],

      async findVideo() {
        for (const sel of this.selectors) {
          const v = document.querySelector(sel);
          if (v && v.readyState >= 1) return v;
        }
        return null;
      },

      async pause(video) {
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    },

    hbo: {
      name: 'HBO Max',
      selectors: ['[class*="Player"] video', 'video'],

      async findVideo() {
        for (const sel of this.selectors) {
          const v = document.querySelector(sel);
          if (v && v.readyState >= 1) return v;
        }
        return null;
      },

      async pause(video) {
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    },

    generic: {
      name: 'Generic',
      selectors: ['video', '[class*="player"] video', '[class*="video"] video', '[id*="player"] video'],

      async findVideo() {
        // Try all selectors
        for (const sel of this.selectors) {
          try {
            const v = document.querySelector(sel);
            if (v && (v.readyState >= 1 || v.src || v.currentSrc)) return v;
          } catch (e) { /* invalid selector */ }
        }
        
        // Find largest visible video (likely the main player)
        const allVideos = document.querySelectorAll('video');
        let bestVideo = null;
        let bestArea = 0;
        
        for (const v of allVideos) {
          const rect = v.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > bestArea && rect.width > 100 && rect.height > 100) {
            bestVideo = v;
            bestArea = area;
          }
        }
        
        return bestVideo || allVideos[0] || null;
      },

      async pause(video) {
        if (!video.paused) { await video.pause(); return true; }
        return false;
      },

      async play(video) {
        if (video.paused) { await video.play(); return true; }
        return false;
      }
    }
  };
}

// ============================================================================
// VIDEO CACHE & HELPERS
// ============================================================================

if (!window.autoplayVideoCache) {
  window.autoplayVideoCache = { 
    element: null, 
    timestamp: null, 
    maxAge: AUTOPLAY_CONFIG.VIDEO_CACHE_TTL,  // Use constant
    lastCheck: 0
  };
}

if (!window.getCachedVideo) {
  window.getCachedVideo = function() {
    const cache = window.autoplayVideoCache;
    const now = Date.now();
    
    // Throttle cache checks using configured interval
    if (now - cache.lastCheck < AUTOPLAY_CONFIG.VIDEO_CACHE_THROTTLE) {
      return cache.element;
    }
    cache.lastCheck = now;
    
    if (cache.element && cache.timestamp && (now - cache.timestamp) < cache.maxAge) {
      // Verify element is still in DOM and playing
      if (cache.element.parentElement && !cache.element.ended) {
        return cache.element;
      }
    }
    cache.element = null;
    cache.timestamp = null;
    return null;
  };
}

if (!window.cacheVideo) {
  window.cacheVideo = function(element) {
    window.autoplayVideoCache.element = element;
    window.autoplayVideoCache.timestamp = Date.now();
    return element;
  };
}

// ============================================================================
// PLATFORM-SPECIFIC FALLBACK CONFIGURATIONS
// Optimizes video finding by only using necessary fallback methods per platform
// ============================================================================

if (!window.PlatformFallbacks) {
  window.PlatformFallbacks = {
    // YouTube is very reliable - direct selector or platform selectors work
    youtube: ['direct', 'platform'],
    
    // Netflix is mostly reliable but sometimes needs generic fallback
    netflix: ['direct', 'platform', 'generic'],
    
    // Crunchyroll uses iframes but platform selectors usually work
    crunchyroll: ['direct', 'platform', 'iframe', 'generic'],
    
    // Prime Video has dynamic loading, needs iframe search
    prime: ['direct', 'platform', 'iframe', 'generic'],
    
    // Disney+ is reliable with direct/platform selectors
    disneyplus: ['direct', 'platform', 'generic'],
    
    // HBO/Max is reliable
    hbo: ['direct', 'platform', 'generic'],
    
    // Hulu is reliable
    hulu: ['direct', 'platform', 'generic'],
    
    // Twitch is reliable
    twitch: ['direct', 'platform', 'generic'],
    
    // Generic fallback uses full chain for unknown sites
    generic: ['direct', 'platform', 'iframe', 'shadowDOM', 'generic']
  };
}

if (!window.getStrategy) {
  window.getStrategy = function() {
    const platform = window.detectPlatform();
    return window.PlatformStrategies[platform] || window.PlatformStrategies.generic;
  };
}

// ============================================================================
// VIDEO FINDING - Multi-strategy with platform-specific fallbacks
// ============================================================================

if (!window.findVideoElement) {
  window.findVideoElement = async function(maxRetries = 5) {
    try {
      const cached = window.getCachedVideo();
      if (cached) return cached;

      const platform = window.detectPlatform();
      const fallbackMethods = window.PlatformFallbacks[platform] || window.PlatformFallbacks.generic;
      const strategy = window.getStrategy();

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * AUTOPLAY_CONFIG.VIDEO_FIND_RETRY_BASE_DELAY));

        try {
          // Execute only the fallback methods configured for this platform
          for (const method of fallbackMethods) {
            let video = null;
            
            switch (method) {
              case 'direct':
                // Direct video selector
                video = document.querySelector('video');
                if (video && isVideoVisible(video)) return window.cacheVideo(video);
                break;
                
              case 'platform':
                // Platform-specific selectors
                for (const sel of strategy.selectors || []) {
                  try {
                    const v = document.querySelector(sel);
                    if (v && isVideoVisible(v)) return window.cacheVideo(v);
                  } catch (e) { /* invalid selector */ }
                }
                break;
                
              case 'iframe':
                // Search iframes
                video = findVideoInIframes();
                if (video) return window.cacheVideo(video);
                break;
                
              case 'shadowDOM':
                // Search shadow DOM
                video = findVideoInShadowDOM();
                if (video) return window.cacheVideo(video);
                break;
                
              case 'generic':
                // Last resort: any video element
                const allVideos = document.querySelectorAll('video');
                for (const v of allVideos) {
                  if (v.videoWidth > 0 || v.readyState >= 1) return window.cacheVideo(v);
                }
                if (allVideos.length > 0) return window.cacheVideo(allVideos[0]);
                break;
            }
          }
        } catch (innerError) {
          console.warn('[AutoPlay] Video search attempt failed:', innerError.message);
        }
      }

      return null;
    } catch (error) {
      console.error('[AutoPlay] findVideoElement failed:', error);
      return null;
    }
  };
}

function isVideoVisible(video) {
  try {
    if (!video) return false;
    if (video.videoWidth > 0 && video.videoHeight > 0) return true;
    if (video.readyState >= 1) return true;
    if (video.offsetParent === null && video.offsetHeight === 0) return false;
    return true;
  } catch (error) {
    return false;
  }
}

function findVideoInIframes() {
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of iframes) {
    try {
      if (iframe.contentDocument) {
        const video = iframe.contentDocument.querySelector('video');
        if (video && video.offsetParent !== null) return video;
      }
    } catch (e) { /* cross-origin */ }
  }
  return null;
}

function findVideoInShadowDOM() {
  const search = (el) => {
    if (el.shadowRoot) {
      const video = el.shadowRoot.querySelector('video');
      if (video && isVideoVisible(video)) return video;
      for (const child of el.shadowRoot.querySelectorAll('*')) {
        const found = search(child);
        if (found) return found;
      }
    }
    return null;
  };
  return search(document.documentElement);
}

// ============================================================================
// PAUSE / PLAY CONTROLS
// ============================================================================

if (!window.autoplayPauseCalled) {
  window.autoplayPauseCalled = false;
}

if (!window.pauseVideo) {
  window.pauseVideo = async function() {
    if (window.autoplayPauseCalled) return;
    window.autoplayPauseCalled = true;

    const isMainFrame = window.self === window.top;
    const hasVideo = document.querySelector('video');
    if (!isMainFrame && !hasVideo) return;

    const strategy = window.getStrategy();
    console.log('[AutoPlay] Pausing with', strategy.name);

    try {
      let video = await Promise.race([
        strategy.findVideo(),
        new Promise(r => setTimeout(() => r(null), 5000))
      ]);

      if (!video && isMainFrame) {
        video = await window.findVideoElement(2);
      }

      if (!video) {
        // Try pause button fallback
        if (findAndClickPauseButton()) {
          showNotification('⏸️ Timer expired - Paused via button', 'info');
          return;
        }
        // Try spacebar
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: ' ', code: 'Space', keyCode: 32, bubbles: true
        }));
        return;
      }

      if (video.paused) return;

      const paused = await strategy.pause(video);
      if (paused) {
        showNotification('⏸️ Timer expired - Video paused', 'success');
      }
    } catch (error) {
      console.error('[AutoPlay] Pause error:', error);
      showNotification('⚠️ Timer expired', 'info');
    }
  };
}

if (!window.playVideo) {
  window.playVideo = async function() {
    const strategy = window.getStrategy();
    
    try {
      let video = await strategy.findVideo();
      if (!video) video = await window.findVideoElement(2);
      if (!video || !video.paused) return;
      
      await strategy.play(video);
    } catch (error) {
      console.error('[AutoPlay] Play error:', error);
    }
  };
}

function findAndClickPauseButton() {
  const pauseSelectors = [
    'button[aria-label*="Pause" i]',
    'button[title*="Pause" i]',
    '.ytp-play-button[aria-label*="Pause"]',
    '[class*="pause"] button',
    '[class*="Pause"] button'
  ];

  for (const selector of pauseSelectors) {
    try {
      const button = document.querySelector(selector);
      if (button && button.offsetHeight > 0) {
        button.click();
        return true;
      }
    } catch (e) { /* invalid selector */ }
  }
  return false;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

function showNotification(message, type = 'info') {
  const colors = {
    success: { bg: '#4CAF50', text: '#fff' },
    warning: { bg: '#FF9800', text: '#fff' },
    error: { bg: '#f44336', text: '#fff' },
    info: { bg: 'rgba(0, 0, 0, 0.9)', text: '#fff' }
  };

  const colorScheme = colors[type] || colors.info;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colorScheme.bg};
    color: ${colorScheme.text};
    padding: 15px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    z-index: 2147483647;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    animation: autoplaySlideIn 0.3s ease-out;
  `;
  overlay.textContent = message;
  document.body.appendChild(overlay);

  // Add animation styles
  if (!document.head.querySelector('#autoplay-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'autoplay-notification-styles';
    style.textContent = `
      @keyframes autoplaySlideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes autoplaySlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => {
    overlay.style.animation = 'autoplaySlideOut 0.3s ease-out';
    setTimeout(() => overlay.remove(), 300);
  }, AUTOPLAY_CONFIG.NOTIFICATION_DURATION);
}

// ============================================================================
// TIMER OVERLAY
// ============================================================================

const OVERLAY_STYLES = `
  .autoplay-overlay {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 16px 20px;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: move;
    user-select: none;
    transition: opacity 0.3s, transform 0.3s;
    opacity: 0;
    transform: translateY(-10px);
  }
  .autoplay-overlay.visible { opacity: 1; transform: translateY(0); }
  .autoplay-overlay-icon { font-size: 24px; }
  .autoplay-overlay-content { display: flex; flex-direction: column; }
  .autoplay-overlay-time {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #818cf8;
  }
  .autoplay-overlay-label { font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px; }
  .autoplay-overlay-close {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    background: #ef4444;
    border: none;
    border-radius: 50%;
    color: white;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .autoplay-overlay:hover .autoplay-overlay-close { opacity: 1; }
  .autoplay-overlay-close:hover { background: #dc2626; }
  .autoplay-overlay.warning .autoplay-overlay-time { color: #f59e0b; animation: autoplayPulse 1s infinite; }
  .autoplay-overlay.critical .autoplay-overlay-time { color: #ef4444; animation: autoplayPulse 0.5s infinite; }
  @keyframes autoplayPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
`;

let autoplayOverlay = null;
let autoplayOverlayEnabled = true; // Cache setting

// Overlay setting cache with TTL to reduce message queue congestion
let overlaySettingCache = {
  value: true,
  timestamp: 0,
  ttl: AUTOPLAY_CONFIG.OVERLAY_SETTING_CACHE_TTL
};

// Load overlay setting from storage with caching
async function loadOverlaySetting() {
  const now = Date.now();
  
  // Return cached value if still fresh
  if (now - overlaySettingCache.timestamp < overlaySettingCache.ttl) {
    autoplayOverlayEnabled = overlaySettingCache.value;
    return;
  }
  
  // Fetch fresh value
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response?.success) {
      const newValue = response.settings?.showOverlay !== false;
      overlaySettingCache = {
        value: newValue,
        timestamp: now,
        ttl: AUTOPLAY_CONFIG.OVERLAY_SETTING_CACHE_TTL
      };
      autoplayOverlayEnabled = newValue;
    }
  } catch (e) {
    autoplayOverlayEnabled = true; // Default to enabled
  }
}

// Load setting on script init
loadOverlaySetting();

function createOverlay() {
  // Check if overlay is disabled in settings
  if (!autoplayOverlayEnabled) return;
  if (autoplayOverlay) return;

  // Inject styles
  if (!document.head.querySelector('#autoplay-overlay-styles')) {
    const style = document.createElement('style');
    style.id = 'autoplay-overlay-styles';
    style.textContent = OVERLAY_STYLES;
    document.head.appendChild(style);
  }

  autoplayOverlay = document.createElement('div');
  autoplayOverlay.className = 'autoplay-overlay';
  
  // Build overlay structure safely
  const icon = document.createElement('span');
  icon.className = 'autoplay-overlay-icon';
  icon.textContent = '😴';
  
  const content = document.createElement('div');
  content.className = 'autoplay-overlay-content';
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'autoplay-overlay-time';
  timeSpan.id = 'autoplayTime';
  timeSpan.textContent = '--:--';
  
  const label = document.createElement('span');
  label.className = 'autoplay-overlay-label';
  label.textContent = 'Sleep timer';
  
  content.appendChild(timeSpan);
  content.appendChild(label);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'autoplay-overlay-close';
  closeBtn.id = 'autoplayClose';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideOverlay();
    chrome.runtime.sendMessage({ action: 'stopTimer' });
  });
  
  autoplayOverlay.appendChild(icon);
  autoplayOverlay.appendChild(content);
  autoplayOverlay.appendChild(closeBtn);
  document.body.appendChild(autoplayOverlay);

  // Make draggable
  makeDraggable(autoplayOverlay);

  requestAnimationFrame(() => autoplayOverlay.classList.add('visible'));
}

// Throttle overlay updates to reduce DOM operations
let lastOverlayUpdate = 0;
let lastOverlayRemaining = -1;

function updateOverlay(remaining) {
  // Check if overlay is disabled
  if (!autoplayOverlayEnabled) return;
  
  // Skip if same value (no visual change needed)
  if (remaining === lastOverlayRemaining) return;
  
  // Throttle using configured interval for better performance
  const now = Date.now();
  if (now - lastOverlayUpdate < AUTOPLAY_CONFIG.OVERLAY_UPDATE_THROTTLE && Math.abs(remaining - lastOverlayRemaining) < 2) return;
  
  lastOverlayUpdate = now;
  lastOverlayRemaining = remaining;
  
  if (!autoplayOverlay) createOverlay();
  
  const timeEl = document.getElementById('autoplayTime');
  if (timeEl) {
    timeEl.textContent = window.AutoPlayUtils.formatCountdown(remaining);
  }

  // Only update classes when threshold is crossed
  const wasWarning = autoplayOverlay.classList.contains('warning');
  const wasCritical = autoplayOverlay.classList.contains('critical');
  const shouldBeWarning = remaining <= AUTOPLAY_CONFIG.OVERLAY_WARNING_THRESHOLD && remaining > AUTOPLAY_CONFIG.OVERLAY_CRITICAL_THRESHOLD;
  const shouldBeCritical = remaining <= AUTOPLAY_CONFIG.OVERLAY_CRITICAL_THRESHOLD;
  
  if (shouldBeCritical && !wasCritical) {
    autoplayOverlay.classList.remove('warning');
    autoplayOverlay.classList.add('critical');
  } else if (shouldBeWarning && !wasWarning) {
    autoplayOverlay.classList.remove('critical');
    autoplayOverlay.classList.add('warning');
  } else if (!shouldBeWarning && !shouldBeCritical && (wasWarning || wasCritical)) {
    autoplayOverlay.classList.remove('warning', 'critical');
  }
}

function showOverlay() {
  if (!autoplayOverlayEnabled) return;
  if (!autoplayOverlay) createOverlay();
  if (autoplayOverlay) autoplayOverlay.classList.add('visible');
}

function hideOverlay() {
  if (autoplayOverlay) autoplayOverlay.classList.remove('visible');
}

function destroyOverlay() {
  if (autoplayOverlay) {
    autoplayOverlay.remove();
    autoplayOverlay = null;
  }
}

function makeDraggable(el) {
  let pos = { x: 0, y: 0 };
  let isDragging = false;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('autoplay-overlay-close')) return;
    isDragging = true;
    pos = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop };
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    el.style.left = (e.clientX - pos.x) + 'px';
    el.style.top = (e.clientY - pos.y) + 'px';
    el.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
}

// ============================================================================
// CUSTOM TIMER PROMPT MODAL
// ============================================================================

if (!window.showCustomTimerPrompt) {
  window.showCustomTimerPrompt = function(callback) {
    // Remove existing modals
    document.querySelectorAll('[data-autoplay-modal]').forEach(m => m.remove());

    const modal = document.createElement('div');
    modal.setAttribute('data-autoplay-modal', 'true');
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      width: 90%;
    `;

    // Build dialog structure safely
    const title = document.createElement('h2');
    title.style.cssText = 'margin-top: 0; color: #333;';
    title.textContent = 'Set Custom Timer';
    
    const description = document.createElement('p');
    description.style.cssText = 'color: #666; margin: 10px 0;';
    description.textContent = 'Enter duration (1 second to 24 hours)';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'autoplayTimerInput';
    input.placeholder = 'e.g., 1s, 30s, 5m, 1h, 1h30m';
    input.style.cssText = 'width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; box-sizing: border-box;';
    
    const hint = document.createElement('p');
    hint.style.cssText = 'color: #999; font-size: 13px; margin: 10px 0;';
    hint.textContent = 'Format: 1s, 30s, 5m, 2h, or combined: 1h30m';
    
    const errorDiv = document.createElement('div');
    errorDiv.id = 'autoplayError';
    errorDiv.style.cssText = 'display: none; color: #f44336; background: #ffebee; padding: 10px; border-radius: 4px; margin: 10px 0;';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 20px;';
    
    const submitBtn = document.createElement('button');
    submitBtn.id = 'autoplaySubmit';
    submitBtn.style.cssText = 'flex: 1; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold;';
    submitBtn.textContent = 'Set Timer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'autoplayCancel';
    cancelBtn.style.cssText = 'flex: 1; padding: 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;';
    cancelBtn.textContent = 'Cancel';
    
    buttonContainer.appendChild(submitBtn);
    buttonContainer.appendChild(cancelBtn);
    
    dialog.appendChild(title);
    dialog.appendChild(description);
    dialog.appendChild(input);
    dialog.appendChild(hint);
    dialog.appendChild(errorDiv);
    dialog.appendChild(buttonContainer);

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const errorEl = dialog.querySelector('#autoplayError');
    input.focus();

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
      input.style.borderColor = '#f44336';
    }

    function closeDialog() {
      modal.remove();
    }

    function submitTimer() {
      const duration = input.value.trim();
      if (!duration) { showError('⚠️ Please enter a duration'); return; }

      const seconds = window.AutoPlayUtils.parseCustomDuration(duration);
      if (seconds < 0) { showError('❌ Invalid format. Use: 1s, 30s, 5m, 2h, or 1h30m'); return; }

      closeDialog();
      if (callback) callback(seconds);

      chrome.runtime.sendMessage({ action: 'startTimer', duration: seconds }, (response) => {
        if (response?.success) {
          showNotification('⏱️ Timer started for ' + window.AutoPlayUtils.formatDuration(seconds));
        }
      });
    }

    dialog.querySelector('#autoplaySubmit').addEventListener('click', submitTimer);
    dialog.querySelector('#autoplayCancel').addEventListener('click', closeDialog);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitTimer(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeDialog(); });
  };
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

if (!window.autoplayMessageListenerAdded) {
  window.autoplayMessageListenerAdded = true;

  console.log('[AutoPlay] Streaming Controller loaded on:', window.location.href);
  console.log('[AutoPlay] Detected platform:', window.detectPlatform());

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Validate sender is from this extension
    if (!sender.id || sender.id !== chrome.runtime.id) {
      console.warn('[AutoPlay] Rejected message from invalid sender:', sender);
      sendResponse({ success: false, error: 'Invalid sender' });
      return;
    }
    
    // Validate message structure
    if (!request || typeof request !== 'object' || !request.action || typeof request.action !== 'string') {
      console.warn('[AutoPlay] Rejected invalid message format');
      sendResponse({ success: false, error: 'Invalid message format' });
      return;
    }
    
    // Check if we're in main frame
    const isMainFrame = window.self === window.top;
    
    // For video control actions, only respond if THIS frame has a video element
    const videoControlActions = ['pauseVideo', 'playVideo'];
    if (videoControlActions.includes(request.action)) {
      const hasVideo = !!document.querySelector('video');
      if (!hasVideo) {
        // This frame doesn't have video, silently ignore
        return;
      }
    }
    
    // For UI actions (overlay, etc), only main frame should respond
    const uiActions = ['showOverlay', 'hideOverlay', 'showCustomTimerPrompt', 'updateOverlay', 'refreshOverlaySetting', 'destroyOverlay'];
    if (uiActions.includes(request.action) && !isMainFrame) {
      // Not main frame, ignore UI actions
      return;
    }
    
    // Log only important actions (not routine updates)
    if (!['updateOverlay', 'timerUpdate'].includes(request.action)) {
      console.log('[AutoPlay] Message received:', request.action);
    }

    try {
      switch (request.action) {
        case 'timerStarted':
        case 'startTimer':
          window.autoplayPauseCalled = false;
          console.log('[AutoPlay] Timer started - pause flag reset');
          sendResponse({ success: true });
          break;

        case 'pauseVideo':
          window.pauseVideo().then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
          return true;

        case 'playVideo':
          window.playVideo().then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
          return true;

        case 'showCustomTimerPrompt':
          if (!isMainFrame) { sendResponse({ success: false }); break; }
          window.showCustomTimerPrompt((seconds) => sendResponse({ success: true, seconds }));
          return true;

        case 'showOverlay':
          // Only show overlay in main frame
          if (isMainFrame) showOverlay();
          sendResponse({ success: true });
          break;

        case 'hideOverlay':
          if (isMainFrame) hideOverlay();
          sendResponse({ success: true });
          break;

        case 'refreshOverlaySetting':
          // Update cached overlay setting immediately and invalidate cache
          if (request.showOverlay !== undefined) {
            autoplayOverlayEnabled = request.showOverlay;
            // Invalidate cache to force fresh fetch on next loadOverlaySetting()
            overlaySettingCache = {
              value: request.showOverlay,
              timestamp: Date.now(),
              ttl: AUTOPLAY_CONFIG.OVERLAY_SETTING_CACHE_TTL
            };
            console.log('[AutoPlay] Overlay setting updated:', autoplayOverlayEnabled);
            
            // If disabled, hide any existing overlay
            if (!autoplayOverlayEnabled && isMainFrame) {
              hideOverlay();
            }
            // If enabled and timer is active, show overlay
            if (autoplayOverlayEnabled && isMainFrame) {
              chrome.runtime.sendMessage({ action: 'getTimerStatus' }, (response) => {
                if (response?.success && response.status?.active) {
                  showOverlay();
                  updateOverlay(response.status.remaining);
                }
              });
            }
          }
          sendResponse({ success: true });
          break;

        case 'updateOverlay':
          // Only update overlay in main frame and if enabled
          if (isMainFrame && request.remaining !== undefined) {
            // Reload setting in case it changed
            loadOverlaySetting().then(() => {
              if (autoplayOverlayEnabled) {
                showOverlay();
                updateOverlay(request.remaining);
              }
            });
          }
          sendResponse({ success: true });
          break;

        case 'destroyOverlay':
          if (isMainFrame) destroyOverlay();
          sendResponse({ success: true });
          break;

        case 'getPlaybackStatus':
          const videos = document.querySelectorAll('video');
          const mainVideo = Array.from(videos).find(v => !v.paused) || videos[0];
          sendResponse({
            success: true,
            status: mainVideo ? {
              hasVideo: true,
              paused: mainVideo.paused,
              currentTime: mainVideo.currentTime,
              duration: mainVideo.duration
            } : { hasVideo: false }
          });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[AutoPlay] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }

    return true;
  });

  // Check for existing timer on load (only in main frame)
  if (window.self === window.top) {
    // Use requestIdleCallback to defer initialization until browser is truly idle
    // This prevents interfering with YouTube's preload resources
    const initializeTimer = () => {
      // Reload setting first, then check timer
      loadOverlaySetting().then(() => {
        chrome.runtime.sendMessage({ action: 'getTimerStatus' }, (response) => {
          if (response?.success && response.status?.active && autoplayOverlayEnabled) {
            showOverlay();
            updateOverlay(response.status.remaining);
          }
        });
      });
    };
    
    // Use requestIdleCallback if available, otherwise setTimeout as fallback
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(initializeTimer, { timeout: 2000 });
    } else {
      setTimeout(initializeTimer, 1000);
    }
  }
}
