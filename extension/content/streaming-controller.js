/**
 * Viboot Streaming Controller
 * Unified content script for video playback control across all streaming platforms
 * Handles: video detection, pause/play, timer overlay, custom timer prompts
 */

// ============================================================================
// UTILITIES
// ============================================================================

if (!window.VibootUtils) {
  window.VibootUtils = {
    /**
     * Parse duration string to seconds (1s, 30s, 5m, 2h, 1h30m, etc.)
     */
    parseCustomDuration(input) {
      const trimmed = input.trim().toLowerCase();
      
      // Plain number = seconds
      if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
        const seconds = parseFloat(trimmed);
        return (seconds >= 1 && seconds <= 86400) ? Math.round(seconds) : -1;
      }
      
      // Parse format like "1h 30m 45s"
      let totalSeconds = 0;
      const regex = /(\d+(?:\.\d+)?)\s*([smh])/g;
      const unitValues = { s: 1, m: 60, h: 3600 };
      let match;
      
      while ((match = regex.exec(trimmed)) !== null) {
        totalSeconds += parseFloat(match[1]) * unitValues[match[2]];
      }
      
      if (totalSeconds === 0) return -1;
      return (totalSeconds >= 1 && totalSeconds <= 86400) ? Math.round(totalSeconds) : -1;
    },

    /**
     * Format seconds to human readable duration
     */
    formatDuration(seconds) {
      if (seconds < 60) return seconds + 's';
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      if (hours > 0) {
        return hours + 'h' + (mins > 0 ? ' ' + mins + 'm' : '');
      }
      return mins + 'm';
    },

    /**
     * Format seconds for countdown display (MM:SS or H:MM:SS)
     */
    formatCountdown(remaining) {
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
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

if (!window.vibootVideoCache) {
  window.vibootVideoCache = { 
    element: null, 
    timestamp: null, 
    maxAge: 10000,  // 10 seconds cache (reduced DOM queries)
    lastCheck: 0
  };
}

if (!window.getCachedVideo) {
  window.getCachedVideo = function() {
    const cache = window.vibootVideoCache;
    const now = Date.now();
    
    // Throttle cache checks to once per 100ms
    if (now - cache.lastCheck < 100) {
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
    window.vibootVideoCache.element = element;
    window.vibootVideoCache.timestamp = Date.now();
    return element;
  };
}

if (!window.getStrategy) {
  window.getStrategy = function() {
    const platform = window.detectPlatform();
    return window.PlatformStrategies[platform] || window.PlatformStrategies.generic;
  };
}

// ============================================================================
// VIDEO FINDING - Multi-strategy with fallbacks
// ============================================================================

if (!window.findVideoElement) {
  window.findVideoElement = async function(maxRetries = 5) {
    try {
      const cached = window.getCachedVideo();
      if (cached) return cached;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 500));

        try {
          // Direct video selector
          let video = document.querySelector('video');
          if (video && isVideoVisible(video)) return window.cacheVideo(video);

          // Platform-specific selectors
          const strategy = window.getStrategy();
          for (const sel of strategy.selectors || []) {
            try {
              const v = document.querySelector(sel);
              if (v && isVideoVisible(v)) return window.cacheVideo(v);
            } catch (e) { /* invalid selector */ }
          }

          // Search iframes
          video = findVideoInIframes();
          if (video) return window.cacheVideo(video);

          // Search shadow DOM
          video = findVideoInShadowDOM();
          if (video) return window.cacheVideo(video);

          // Last resort: any video element
          const allVideos = document.querySelectorAll('video');
          for (const v of allVideos) {
            if (v.videoWidth > 0 || v.readyState >= 1) return window.cacheVideo(v);
          }
          if (allVideos.length > 0) return window.cacheVideo(allVideos[0]);
        } catch (innerError) {
          console.warn('[Viboot] Video search attempt failed:', innerError.message);
        }
      }

      return null;
    } catch (error) {
      console.error('[Viboot] findVideoElement failed:', error);
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

if (!window.vibootPauseCalled) {
  window.vibootPauseCalled = false;
}

if (!window.pauseVideo) {
  window.pauseVideo = async function() {
    if (window.vibootPauseCalled) return;
    window.vibootPauseCalled = true;

    const isMainFrame = window.self === window.top;
    const hasVideo = document.querySelector('video');
    if (!isMainFrame && !hasVideo) return;

    const strategy = window.getStrategy();
    console.log('[Viboot] Pausing with', strategy.name);

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
      console.error('[Viboot] Pause error:', error);
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
      console.error('[Viboot] Play error:', error);
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
    animation: vibootSlideIn 0.3s ease-out;
  `;
  overlay.textContent = message;
  document.body.appendChild(overlay);

  // Add animation styles
  if (!document.head.querySelector('#viboot-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'viboot-notification-styles';
    style.textContent = `
      @keyframes vibootSlideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes vibootSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => {
    overlay.style.animation = 'vibootSlideOut 0.3s ease-out';
    setTimeout(() => overlay.remove(), 300);
  }, 3000);
}

// ============================================================================
// TIMER OVERLAY
// ============================================================================

const OVERLAY_STYLES = `
  .viboot-overlay {
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
  .viboot-overlay.visible { opacity: 1; transform: translateY(0); }
  .viboot-overlay-icon { font-size: 24px; }
  .viboot-overlay-content { display: flex; flex-direction: column; }
  .viboot-overlay-time {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #818cf8;
  }
  .viboot-overlay-label { font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px; }
  .viboot-overlay-close {
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
  .viboot-overlay:hover .viboot-overlay-close { opacity: 1; }
  .viboot-overlay-close:hover { background: #dc2626; }
  .viboot-overlay.warning .viboot-overlay-time { color: #f59e0b; animation: vibootPulse 1s infinite; }
  .viboot-overlay.critical .viboot-overlay-time { color: #ef4444; animation: vibootPulse 0.5s infinite; }
  @keyframes vibootPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
`;

let vibootOverlay = null;
let vibootOverlayEnabled = true; // Cache setting

// Load overlay setting from storage
async function loadOverlaySetting() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response?.success) {
      vibootOverlayEnabled = response.settings?.showOverlay !== false;
    }
  } catch (e) {
    vibootOverlayEnabled = true; // Default to enabled
  }
}

// Load setting on script init
loadOverlaySetting();

function createOverlay() {
  // Check if overlay is disabled in settings
  if (!vibootOverlayEnabled) return;
  if (vibootOverlay) return;

  // Inject styles
  if (!document.head.querySelector('#viboot-overlay-styles')) {
    const style = document.createElement('style');
    style.id = 'viboot-overlay-styles';
    style.textContent = OVERLAY_STYLES;
    document.head.appendChild(style);
  }

  vibootOverlay = document.createElement('div');
  vibootOverlay.className = 'viboot-overlay';
  vibootOverlay.innerHTML = `
    <span class="viboot-overlay-icon">😴</span>
    <div class="viboot-overlay-content">
      <span class="viboot-overlay-time" id="vibootTime">--:--</span>
      <span class="viboot-overlay-label">Sleep timer</span>
    </div>
    <button class="viboot-overlay-close" id="vibootClose">×</button>
  `;
  document.body.appendChild(vibootOverlay);

  // Close button
  document.getElementById('vibootClose').addEventListener('click', (e) => {
    e.stopPropagation();
    hideOverlay();
    chrome.runtime.sendMessage({ action: 'stopTimer' });
  });

  // Make draggable
  makeDraggable(vibootOverlay);

  requestAnimationFrame(() => vibootOverlay.classList.add('visible'));
}

// Throttle overlay updates to reduce DOM operations
let lastOverlayUpdate = 0;
let lastOverlayRemaining = -1;

function updateOverlay(remaining) {
  // Check if overlay is disabled
  if (!vibootOverlayEnabled) return;
  
  // Skip if same value (no visual change needed)
  if (remaining === lastOverlayRemaining) return;
  
  // Throttle to max 1 update per 500ms (timer shows seconds, but we update twice per second max)
  const now = Date.now();
  if (now - lastOverlayUpdate < 500 && Math.abs(remaining - lastOverlayRemaining) < 2) return;
  
  lastOverlayUpdate = now;
  lastOverlayRemaining = remaining;
  
  if (!vibootOverlay) createOverlay();
  
  const timeEl = document.getElementById('vibootTime');
  if (timeEl) {
    timeEl.textContent = window.VibootUtils.formatCountdown(remaining);
  }

  // Only update classes when threshold is crossed
  const wasWarning = vibootOverlay.classList.contains('warning');
  const wasCritical = vibootOverlay.classList.contains('critical');
  const shouldBeWarning = remaining <= 300 && remaining > 60;
  const shouldBeCritical = remaining <= 60;
  
  if (shouldBeCritical && !wasCritical) {
    vibootOverlay.classList.remove('warning');
    vibootOverlay.classList.add('critical');
  } else if (shouldBeWarning && !wasWarning) {
    vibootOverlay.classList.remove('critical');
    vibootOverlay.classList.add('warning');
  } else if (!shouldBeWarning && !shouldBeCritical && (wasWarning || wasCritical)) {
    vibootOverlay.classList.remove('warning', 'critical');
  }
}

function showOverlay() {
  if (!vibootOverlayEnabled) return;
  if (!vibootOverlay) createOverlay();
  if (vibootOverlay) vibootOverlay.classList.add('visible');
}

function hideOverlay() {
  if (vibootOverlay) vibootOverlay.classList.remove('visible');
}

function destroyOverlay() {
  if (vibootOverlay) {
    vibootOverlay.remove();
    vibootOverlay = null;
  }
}

function makeDraggable(el) {
  let pos = { x: 0, y: 0 };
  let isDragging = false;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('viboot-overlay-close')) return;
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
    document.querySelectorAll('[data-viboot-modal]').forEach(m => m.remove());

    const modal = document.createElement('div');
    modal.setAttribute('data-viboot-modal', 'true');
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

    dialog.innerHTML = `
      <h2 style="margin-top: 0; color: #333;">Set Custom Timer</h2>
      <p style="color: #666; margin: 10px 0;">Enter duration (1 second to 24 hours)</p>
      <input type="text" id="vibootTimerInput" placeholder="e.g., 1s, 30s, 5m, 1h, 1h30m"
             style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; box-sizing: border-box;">
      <p style="color: #999; font-size: 13px; margin: 10px 0;">Format: 1s, 30s, 5m, 2h, or combined: 1h30m</p>
      <div id="vibootError" style="display: none; color: #f44336; background: #ffebee; padding: 10px; border-radius: 4px; margin: 10px 0;"></div>
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button id="vibootSubmit" style="flex: 1; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold;">
          Set Timer
        </button>
        <button id="vibootCancel" style="flex: 1; padding: 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
          Cancel
        </button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const input = dialog.querySelector('#vibootTimerInput');
    const errorEl = dialog.querySelector('#vibootError');
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

      const seconds = window.VibootUtils.parseCustomDuration(duration);
      if (seconds < 0) { showError('❌ Invalid format. Use: 1s, 30s, 5m, 2h, or 1h30m'); return; }

      closeDialog();
      if (callback) callback(seconds);

      chrome.runtime.sendMessage({ action: 'startTimer', duration: seconds }, (response) => {
        if (response?.success) {
          showNotification('⏱️ Timer started for ' + window.VibootUtils.formatDuration(seconds));
        }
      });
    }

    dialog.querySelector('#vibootSubmit').addEventListener('click', submitTimer);
    dialog.querySelector('#vibootCancel').addEventListener('click', closeDialog);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitTimer(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeDialog(); });
  };
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

if (!window.vibootMessageListenerAdded) {
  window.vibootMessageListenerAdded = true;

  console.log('[Viboot] Streaming Controller loaded on:', window.location.href);
  console.log('[Viboot] Detected platform:', window.detectPlatform());

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Viboot] Message received:', request.action);

    // Check if we're in main frame (for overlay-related actions)
    const isMainFrame = window.self === window.top;

    try {
      switch (request.action) {
        case 'timerStarted':
        case 'startTimer':
          window.vibootPauseCalled = false;
          console.log('[Viboot] Timer started - pause flag reset');
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

        case 'updateOverlay':
          // Only update overlay in main frame and if enabled
          if (isMainFrame && request.remaining !== undefined) {
            // Reload setting in case it changed
            loadOverlaySetting().then(() => {
              if (vibootOverlayEnabled) {
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
      console.error('[Viboot] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }

    return true;
  });

  // Check for existing timer on load (only in main frame)
  if (window.self === window.top) {
    // Reload setting first, then check timer
    loadOverlaySetting().then(() => {
      chrome.runtime.sendMessage({ action: 'getTimerStatus' }, (response) => {
        if (response?.success && response.status?.active && vibootOverlayEnabled) {
          showOverlay();
          updateOverlay(response.status.remaining);
        }
      });
    });
  }
}
