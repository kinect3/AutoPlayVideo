# 🗺️ Complete System Architecture Map

## 📊 Visual Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          AUTOPLAYVIDEO CHROME EXTENSION                     │
└────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: USER INTERFACE (popup/, settings/)                                │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐       │
│  │  popup.html  │────────▶│  popup.js    │────────▶│ Analytics    │       │
│  │  popup.css   │         │ - Start timer│         │ - Track views│       │
│  └──────────────┘         │ - Display UI │         │ - Track start│       │
│                            └──────┬───────┘         └──────────────┘       │
│  ┌──────────────┐                │ Sends Messages                          │
│  │settings.html │────────▶┌──────▼──────┐                                  │
│  │settings.css  │         │ settings.js │                                  │
│  └──────────────┘         │ - Config UI │                                  │
│                            │ - Save prefs│                                  │
│                            └─────────────┘                                  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ chrome.runtime.sendMessage()
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: BUSINESS LOGIC (background/)                                      │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  service-worker.js (418 lines) - Message Handler & Coordinator  │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │       │
│  │  │ Start Timer  │  │  Stop Timer  │  │Context Menus │         │       │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────────┘         │       │
│  │         │                  │                                     │       │
│  │         ├─────────────────▶│◀───── Delegates to ─────────┐     │       │
│  │         │                  │                              │     │       │
│  └─────────┼──────────────────┼──────────────────────────────┼─────┘       │
│            │                  │                              │             │
│  ┌─────────▼──────────────────▼──────────────────────────────▼─────┐       │
│  │  timer-engine.js (683 lines) - ⚠️  GOD OBJECT                   │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │       │
│  │  │  Lifecycle   │  │   State Mgmt  │  │ Notifications│         │       │
│  │  │ - start()    │  │ - tick()      │  │ - badge      │         │       │
│  │  │ - stop()     │  │ - persist()   │  │ - sound      │         │       │
│  │  │ - pause()    │  │ - validate()  │  │ - messages   │         │       │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │       │
│  └──────────────────────────────┬──────────────────────────────────┘       │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │ chrome.tabs.sendMessage()
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: CONTENT SCRIPTS (content/)                                        │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  streaming-controller.js (1,320 lines) - ⚠️  TOO BIG           │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │       │
│  │  │Platform Detect│ │ Video Finder │  │Video Control │         │       │
│  │  │ - Netflix    │  │ - Selectors  │  │ - pause()    │         │       │
│  │  │ - YouTube    │  │ - Wait logic │  │ - play()     │         │       │
│  │  │ - Disney+    │  │ - MutationObs│  │ - seek()     │         │       │
│  │  │ - 7 more     │  │              │  │              │         │       │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │       │
│  │                                                                 │       │
│  │  ⚠️  DUPLICATE CODE: parseTimeInput, formatSeconds (Lines 11-61)│       │
│  └─────────────────────────────────────────────────────────────────┘       │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ Controls
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 4: VIDEO ELEMENTS (Streaming Platform DOM)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│  │ <video> tag  │  │ Player UI    │  │ Controls     │                     │
│  │ - Netflix    │  │ - Overlays   │  │ - Play/Pause │                     │
│  │ - YouTube    │  │ - Progress   │  │ - Seek bar   │                     │
│  │ - Disney+    │  │              │  │              │                     │
│  └──────────────┘  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  CROSS-CUTTING CONCERNS (utils/)                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│  │ analytics.js │  │time-utils.js │  │  storage.js  │                     │
│  │ - GA4 track  │  │ - Parse time │  │ - chrome.    │                     │
│  │ - Events     │  │ - Format     │  │   storage    │                     │
│  │              │  │              │  │   wrapper    │                     │
│  └──────────────┘  └──────────────┘  └──────────────┘                     │
│                                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────────────┐       │
│  │  config.js   │  │ config-manager.js                            │       │
│  │ - Constants  │  │ - Remote config fetch (viboot.onrender.com) │       │
│  │ - Defaults   │  │ - Retry logic, caching, fallbacks           │       │
│  └──────────────┘  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│  │  Google GA4  │  │Render Server │  │  Supabase DB │                     │
│  │ - Analytics  │  │ - Config API │  │ - Telemetry  │                     │
│  │ - Events     │  │ - 200 OK     │  │ - Optional   │                     │
│  └──────────────┘  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 TARGET ARCHITECTURE (After Refactoring)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FEATURE MODULE STRUCTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

extension/
├── features/                     ← NEW: Feature-based organization
│   ├── timer/                    ← All timer code together
│   │   ├── timer-coordinator.js      (150 lines) - Message handling
│   │   ├── timer-lifecycle.js        (150 lines) - Start/stop/pause
│   │   ├── timer-state.js            (100 lines) - State management
│   │   ├── timer-persistence.js      (120 lines) - Storage
│   │   ├── timer-notifications.js    (80 lines)  - Badge/sounds
│   │   ├── timer-commands.js         (100 lines) - Command pattern
│   │   └── tests/                    ← Tests next to code
│   │       ├── timer-lifecycle.test.js
│   │       ├── timer-state.test.js
│   │       └── timer-persistence.test.js
│   │
│   ├── video-control/            ← All video code together
│   │   ├── video-finder.js           (150 lines) - Unified finder
│   │   ├── video-controller.js       (100 lines) - Pause/play/seek
│   │   ├── strategies/               ← Strategy pattern
│   │   │   ├── base-strategy.js      (50 lines)  - Abstract base
│   │   │   ├── netflix-strategy.js   (80 lines)
│   │   │   ├── youtube-strategy.js   (80 lines)
│   │   │   ├── disney-strategy.js    (80 lines)
│   │   │   └── ... (7 more)
│   │   └── tests/
│   │       ├── video-finder.test.js
│   │       └── strategies/
│   │           └── netflix-strategy.test.js
│   │
│   └── analytics/                ← All analytics together
│       ├── analytics-client.js       (150 lines) - GA4 integration
│       ├── analytics-events.js       (100 lines) - Event definitions
│       └── tests/
│           └── analytics-client.test.js
│
├── shared/                       ← NEW: Shared utilities
│   ├── utils/
│   │   ├── time-utils.js             (80 lines)  - Time functions
│   │   ├── error-handler.js          (100 lines) - Error patterns
│   │   └── logger.js                 (50 lines)  - Logging
│   ├── types/
│   │   ├── timer-types.js            (50 lines)  - Type definitions
│   │   └── video-types.js            (50 lines)
│   └── storage/
│       ├── storage-client.js         (100 lines) - Storage abstraction
│       └── timer-repository.js       (80 lines)  - Repository pattern
│
├── popup/                        ← UI stays same location
│   ├── popup.html
│   ├── popup.css
│   └── popup.js                      (300 lines) - Cleaned up
│
├── settings/                     ← UI stays same location
│   ├── settings.html
│   ├── settings.css
│   └── settings.js                   (300 lines) - Cleaned up
│
└── manifest.json                 ← Configuration

tests/                            ← Global test setup
├── setup.js                      ← Chrome API mocks
├── integration/                  ← Integration tests
│   ├── timer-flow.test.js
│   └── video-control-flow.test.js
└── e2e/                          ← End-to-end tests
    └── full-timer-cycle.test.js
```

---

## 🔄 Data Flow Patterns

### **Pattern 1: Timer Start Flow**

```
User clicks "Start Timer" in popup
         │
         ▼
┌────────────────────┐
│ popup.js           │ 1. Validate input
│ - Validate minutes │ 2. Send message to background
│ - Send message     │ 3. Track analytics event
└─────────┬──────────┘
          │ chrome.runtime.sendMessage({ action: 'startTimer', minutes: 30 })
          ▼
┌────────────────────────────┐
│ timer-coordinator.js       │ 1. Receive message
│ (service worker)           │ 2. Execute command
│ - Command registry         │ 3. Return response
│ - Route to handlers        │
└─────────┬──────────────────┘
          │ timerCommands.execute('startTimer', { minutes: 30 })
          ▼
┌────────────────────────────┐
│ timer-lifecycle.js         │ 1. Stop existing timer
│ - Business logic           │ 2. Create timer state
│ - Validation               │ 3. Save to storage
│ - Orchestration            │ 4. Start countdown
└─────────┬──────────────────┘
          │ Uses Repository
          ▼
┌────────────────────────────┐
│ timer-persistence.js       │ 1. Serialize timer
│ - Repository pattern       │ 2. Save to chrome.storage
│ - Storage abstraction      │
└────────────────────────────┘
          │
          ▼
┌────────────────────────────┐
│ chrome.alarms              │ 1. Create alarm
│ - System timer             │ 2. Fire every second
│ - Survives restarts        │
└────────────────────────────┘
```

### **Pattern 2: Timer Expiration Flow**

```
chrome.alarms fires "timerTick"
         │
         ▼
┌────────────────────────────┐
│ timer-coordinator.js       │ 1. Receive alarm
│ - onAlarm listener         │ 2. Delegate to engine
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────────────┐
│ timer-lifecycle.js         │ 1. Get current timer
│ - tick() method            │ 2. Decrement remaining
│                            │ 3. Check if expired
└─────────┬──────────────────┘
          │ If expired
          ▼
┌────────────────────────────┐
│ video-controller.js        │ 1. Find video element
│ - pauseVideo()             │ 2. Pause playback
└────────────────────────────┘
          │ Sends message to content script
          ▼
┌────────────────────────────┐
│ streaming-controller.js    │ 1. Receive pause command
│ (content script)           │ 2. Find video via strategy
│                            │ 3. Execute video.pause()
└─────────┬──────────────────┘
          │ Finds platform strategy
          ▼
┌────────────────────────────┐
│ netflix-strategy.js        │ 1. Match URL pattern
│ - Platform-specific logic  │ 2. Use Netflix selectors
│                            │ 3. Return video element
└────────────────────────────┘
          │
          ▼
┌────────────────────────────┐
│ <video> element            │ 1. .pause() called
│ - Native HTML5 video       │ 2. Playback stops
└────────────────────────────┘
          │
          ▼
┌────────────────────────────┐
│ timer-notifications.js     │ 1. Show badge
│ - Update badge             │ 2. Play sound
│ - Play sound               │ 3. Show notification
│ - Send notification        │
└────────────────────────────┘
```

---

## 🧩 Design Patterns Applied

### **1. Command Pattern**
```javascript
// Problem: Giant switch statement in service-worker
// Solution: Command registry

const commands = {
  startTimer: new StartTimerCommand(timerEngine),
  stopTimer: new StopTimerCommand(timerEngine),
  pauseTimer: new PauseTimerCommand(timerEngine)
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const command = commands[msg.action];
  command.execute(msg).then(sendResponse);
});
```

### **2. Strategy Pattern**
```javascript
// Problem: Massive if/else for platform detection
// Solution: Strategy registry

class PlatformDetector {
  strategies = [
    new NetflixStrategy(),
    new YouTubeStrategy(),
    new DisneyStrategy()
  ];
  
  detect(url) {
    return this.strategies.find(s => s.matches(url));
  }
}
```

### **3. Repository Pattern**
```javascript
// Problem: Direct chrome.storage calls everywhere
// Solution: Repository abstraction

class TimerRepository {
  async save(timer) {
    await chrome.storage.local.set({ activeTimer: timer });
  }
  
  async find() {
    const data = await chrome.storage.local.get('activeTimer');
    return data.activeTimer || null;
  }
}
```

### **4. Observer Pattern**
```javascript
// Problem: Tight coupling between timer and notifications
// Solution: Event emitter

class TimerEngine extends EventEmitter {
  onExpire() {
    this.emit('timer:expired', { timer: this.activeTimer });
  }
}

timerEngine.on('timer:expired', (event) => {
  notificationService.notify(event.timer);
  badgeService.update('Timer Complete!');
});
```

---

## 📊 Metrics Comparison

### **Before Refactoring**
```
Code Organization:        5/10  (Files too big)
Test Coverage:            0/10  (No tests)
Code Duplication:         4/10  (4 duplicates)
Documentation:            6/10  (Some JSDoc)
Maintainability:          6/10  (Hard to change)
Onboarding Time:          2/10  (2+ days)

Overall Score:            3.8/10
```

### **After Refactoring (Target)**
```
Code Organization:        9/10  (Feature modules)
Test Coverage:            9/10  (85% coverage)
Code Duplication:         10/10 (Zero duplicates)
Documentation:            9/10  (100% JSDoc)
Maintainability:          9/10  (Easy to change)
Onboarding Time:          9/10  (2 hours)

Overall Score:            9.2/10
```

---

## 🚀 Implementation Timeline

```
Week 1-2: Foundation
├─ Day 1-2: Setup tooling ✅
├─ Day 3-4: Measure baseline
├─ Day 5-7: Create structure
└─ Day 8-10: Extract TimerRepository

Week 3-4: Core Refactoring
├─ Day 11-15: Split timer-engine.js
├─ Day 16-18: Extract video strategies
└─ Day 19-20: Integration testing

Week 5: Eliminate Duplication
├─ Day 21-22: Remove inline functions
├─ Day 23-24: Centralize error handling
└─ Day 25: Consolidate platform detection

Week 6-8: Type Safety (Optional)
├─ Day 26-30: Migrate utilities to TypeScript
├─ Day 31-35: Add interfaces
└─ Day 36-40: Full TypeScript migration
```

---

## 📚 Reference Quick Links

**Daily Work:**
- [CODING_GUIDE.md](CODING_GUIDE.md) - How to write code
- [PHASE_1_CHECKLIST.md](PHASE_1_CHECKLIST.md) - Week-by-week tasks

**Architecture:**
- [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) - Complete guide
- [ARCHITECTURE_REVISION_SUMMARY.md](ARCHITECTURE_REVISION_SUMMARY.md) - Overview

**Testing:**
- `tests/setup.js` - Chrome API mocks
- `tests/example.test.js` - Test templates

**Tooling:**
- `.eslintrc.json` - Linting rules
- `vitest.config.js` - Test configuration
- `package.json` - Build scripts

---

**Status:** ✅ Complete system map documented  
**Next:** 🚀 Begin implementation using this as reference
