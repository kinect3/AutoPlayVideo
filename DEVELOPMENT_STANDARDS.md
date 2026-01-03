# 🏗️ Development Standards & Architecture Guide

**Version:** 2.0  
**Last Updated:** January 3, 2026  
**Status:** Active

---

## � Document Hierarchy

This document is part of a complete development system:

```
📊 PRODUCT_DEVELOPMENT_GUIDE.md
    └─ Strategic: What to build, why, and when
        │
        └─ 🏗️ DEVELOPMENT_STANDARDS.md (This document)
            └─ Tactical: How to build it (architecture, patterns)
                │
                └─ 📝 CODING_GUIDE.md
                    └─ Daily: Writing individual functions and files
                        │
                        └─ 💬 COMMUNICATION_PROTOCOL.md
                            └─ How to work with AI assistants effectively
```

**See also:**
- [PRODUCT_DEVELOPMENT_GUIDE.md](PRODUCT_DEVELOPMENT_GUIDE.md) - Problem definition to deployment
- [CODING_GUIDE.md](CODING_GUIDE.md) - Daily coding reference
- [COMMUNICATION_PROTOCOL.md](COMMUNICATION_PROTOCOL.md) - How to communicate effectively

---

## �📐 CORE ARCHITECTURAL PRINCIPLES

### **1. Single Responsibility Principle**
Every module, class, and function does ONE thing well.

**✅ Good Example:**
```javascript
// time-utils.js - ONLY handles time parsing/formatting
export function parseTimeInput(input) { /* ... */ }
export function formatSecondsToDisplay(seconds) { /* ... */ }
```

**❌ Bad Example:**
```javascript
// DON'T: Mix time parsing with analytics
function parseTimeInput(input) {
  const result = /* parsing logic */;
  trackEvent('time_parsed', { input }); // ❌ Wrong layer
  return result;
}
```

---

### **2. Dependency Direction Rule**
Dependencies ALWAYS flow inward: UI → Business Logic → Utilities

```
┌─────────────────────────────────────┐
│  UI Layer (popup, settings)         │  ← User interaction
│  - Click handlers                   │
│  - Display formatting               │
└────────────┬────────────────────────┘
             ↓ Uses (imports)
┌────────────────────────────────────┐
│  Business Logic (service-worker)   │  ← Orchestration
│  - Timer coordination               │
│  - State management                 │
└────────────┬───────────────────────┘
             ↓ Uses (imports)
┌────────────────────────────────────┐
│  Domain Logic (timer-engine)       │  ← Core behavior
│  - Timer countdown                  │
│  - State transitions                │
└────────────┬───────────────────────┘
             ↓ Uses (imports)
┌────────────────────────────────────┐
│  Utilities (time-utils, storage)   │  ← Pure functions
│  - Time parsing                     │
│  - Storage abstraction              │
└────────────────────────────────────┘
```

**Rule:** Lower layers NEVER import from upper layers.

---

### **3. Feature Module Pattern**
Each feature lives in its own folder with all related files.

**Current Structure (Needs Improvement):**
```
extension/
├── background/
│   ├── service-worker.js        # 418 lines - TOO BIG
│   └── timer-engine.js          # 683 lines - TOO BIG
```

**Target Structure:**
```
extension/
├── features/
│   ├── timer/
│   │   ├── timer-coordinator.js    # Handles messages (100 lines)
│   │   ├── timer-lifecycle.js      # Start/stop/pause (150 lines)
│   │   ├── timer-persistence.js    # Save/restore state (100 lines)
│   │   ├── timer-notifications.js  # Badge/notifications (80 lines)
│   │   └── timer-types.js          # Shared types/constants
│   ├── video-control/
│   │   ├── video-finder.js         # Platform-specific finding
│   │   ├── video-controller.js     # Pause/play/seek
│   │   └── platform-strategies.js  # Netflix, YouTube, etc.
│   └── analytics/
│       ├── analytics-client.js     # GA4 tracking
│       └── analytics-events.js     # Event definitions
└── shared/
    ├── utils/                       # Cross-feature utilities
    └── types/                       # Shared type definitions
```

---

## 📝 CODING STANDARDS

### **File Size Limits**
- **Maximum 300 lines** per file
- **Maximum 50 lines** per function
- **Maximum 5 parameters** per function

**When a file exceeds 300 lines, SPLIT IT:**
```javascript
// timer-engine.js (683 lines) → Split into:
// 1. timer-lifecycle.js    (150 lines) - Start/stop/pause logic
// 2. timer-state.js         (100 lines) - State management
// 3. timer-persistence.js   (120 lines) - Save/restore
// 4. timer-notifications.js (80 lines)  - UI updates
// 5. timer-coordinator.js   (150 lines) - Compose all pieces
```

---

### **Function Complexity Rules**

**Maximum Cyclomatic Complexity: 10**

**✅ Good - Simple, testable:**
```javascript
async function startTimer(minutes, tabId) {
  // 1. Validate
  const validation = validateTimerInput(minutes, tabId);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // 2. Stop existing
  await stopExistingTimer();
  
  // 3. Create new
  const timer = createTimerState(minutes, tabId);
  
  // 4. Persist
  await saveTimerState(timer);
  
  // 5. Start countdown
  startCountdown(timer);
  
  return timer;
}
```

**❌ Bad - Too many nested conditions:**
```javascript
async function startTimer(minutes, tabId) {
  if (minutes) {
    if (tabId) {
      if (minutes > 0 && minutes < 1440) {
        if (await checkTabExists(tabId)) {
          if (!this.activeTimer) {
            // ... 6 levels deep ❌
          }
        }
      }
    }
  }
}
```

---

### **Naming Conventions (STRICT)**

**Variables & Functions:** `camelCase`
```javascript
const timerDuration = 60;
function startTimer() {}
async function fetchRemoteConfig() {}
```

**Constants:** `UPPER_SNAKE_CASE`
```javascript
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMER_DURATION = 1800;
```

**Classes:** `PascalCase`
```javascript
class TimerEngine {}
class VideoFinder {}
```

**Private Methods:** Prefix with `_`
```javascript
class TimerEngine {
  async start() {
    await this._validateState();  // Private
  }
  
  _validateState() {  // Convention: internal use only
    return this.activeTimer !== null;
  }
}
```

**Boolean Variables:** Use `is`, `has`, `should`, `can`
```javascript
const isActive = true;
const hasPermission = false;
const shouldRetry = true;
const canPause = false;
```

---

### **Comment Standards**

**Every file MUST have:**
```javascript
/**
 * [Module Name] - [Brief Description]
 * 
 * Purpose:
 * - What this module does
 * - Why it exists
 * 
 * Dependencies:
 * - List key imports
 * 
 * Used by:
 * - List key consumers
 * 
 * @module feature/timer/timer-lifecycle
 */
```

**Every public function MUST have JSDoc:**
```javascript
/**
 * Start a new timer for the specified duration
 * 
 * @param {number} minutes - Timer duration in minutes (1-1440)
 * @param {number} tabId - Chrome tab ID where timer runs
 * @returns {Promise<TimerState>} The created timer state
 * @throws {Error} If minutes out of range or tab doesn't exist
 * 
 * @example
 * const timer = await startTimer(30, 123456);
 * console.log(timer.duration); // 1800 seconds
 */
async function startTimer(minutes, tabId) {
  // Implementation
}
```

**Complex logic needs inline comments:**
```javascript
// Calculate actual remaining time considering service worker sleep
// Chrome alarms are more reliable than setInterval for background timers
const elapsedTime = Date.now() - this.activeTimer.startTime;
const actualRemaining = this.activeTimer.duration - Math.floor(elapsedTime / 1000);
```

---

## 🏭 IMPLEMENTATION PATTERNS

### **Pattern 1: Command Pattern for Messages**

**Problem:** service-worker.js has giant switch statement (200+ lines)

**Solution:** Command registry
```javascript
// features/timer/timer-commands.js
export class TimerCommands {
  constructor(timerEngine) {
    this.engine = timerEngine;
    this.commands = this._registerCommands();
  }
  
  _registerCommands() {
    return {
      startTimer: this._handleStart.bind(this),
      stopTimer: this._handleStop.bind(this),
      pauseTimer: this._handlePause.bind(this),
      resumeTimer: this._handleResume.bind(this),
      extendTimer: this._handleExtend.bind(this)
    };
  }
  
  async execute(action, params) {
    const command = this.commands[action];
    if (!command) {
      throw new Error(`Unknown command: ${action}`);
    }
    return await command(params);
  }
  
  async _handleStart({ minutes, tabId, source }) {
    // Focused, testable handler
    const timer = await this.engine.start(minutes, tabId);
    await trackTimerStart(minutes * 60, source);
    return { success: true, timer };
  }
}

// service-worker.js (simplified)
const timerCommands = new TimerCommands(timerEngine);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  timerCommands.execute(message.action, message)
    .then(sendResponse)
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
});
```

---

### **Pattern 2: Strategy Pattern for Platform Detection**

**Current:** Massive if/else chain in streaming-controller.js

**Solution:** Strategy registry
```javascript
// features/video-control/strategies/netflix-strategy.js
export class NetflixStrategy {
  get platform() { return 'netflix'; }
  
  matches(url) {
    return url.includes('netflix.com');
  }
  
  async findVideo() {
    return document.querySelector('video');
  }
  
  getSelectors() {
    return {
      video: 'video',
      player: '.nfp-chrome-player-layer',
      skipIntro: "[data-uia='player-skip-intro']"
    };
  }
}

// features/video-control/video-finder.js
export class VideoFinder {
  constructor() {
    this.strategies = [
      new NetflixStrategy(),
      new YouTubeStrategy(),
      new DisneyStrategy(),
      // ... register all platforms
    ];
  }
  
  detectPlatform(url) {
    return this.strategies.find(s => s.matches(url));
  }
  
  async findVideo(url) {
    const strategy = this.detectPlatform(url);
    if (!strategy) return null;
    
    return await strategy.findVideo();
  }
}
```

---

### **Pattern 3: Repository Pattern for Storage**

**Current:** Direct chrome.storage calls scattered everywhere

**Solution:** Repository abstraction
```javascript
// shared/storage/timer-repository.js
export class TimerRepository {
  async save(timer) {
    await chrome.storage.local.set({
      activeTimer: this._serialize(timer)
    });
  }
  
  async find() {
    const data = await chrome.storage.local.get('activeTimer');
    return data.activeTimer ? this._deserialize(data.activeTimer) : null;
  }
  
  async delete() {
    await chrome.storage.local.remove('activeTimer');
  }
  
  _serialize(timer) {
    return {
      ...timer,
      startTime: timer.startTime.toISOString()
    };
  }
  
  _deserialize(data) {
    return {
      ...data,
      startTime: new Date(data.startTime)
    };
  }
}

// Usage in timer-lifecycle.js
const timerRepo = new TimerRepository();

async function startTimer(minutes, tabId) {
  const timer = createTimer(minutes, tabId);
  await timerRepo.save(timer);  // Clean, testable
  return timer;
}
```

---

## 🧪 TESTING STANDARDS

### **Test Coverage Requirements**
- **Utilities:** 100% coverage (pure functions, easy to test)
- **Business Logic:** 80% coverage (core features)
- **UI Code:** 50% coverage (integration tests preferred)

### **Test File Structure**
```javascript
// tests/unit/timer-lifecycle.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimerLifecycle } from '../../features/timer/timer-lifecycle';

describe('TimerLifecycle', () => {
  let lifecycle;
  let mockRepo;
  
  beforeEach(() => {
    mockRepo = createMockRepository();
    lifecycle = new TimerLifecycle(mockRepo);
  });
  
  afterEach(() => {
    // Clean up
  });
  
  describe('startTimer', () => {
    it('should create timer with correct duration', async () => {
      const timer = await lifecycle.start(30, 12345);
      expect(timer.duration).toBe(1800); // 30 * 60
    });
    
    it('should throw error for invalid duration', async () => {
      await expect(lifecycle.start(0, 12345))
        .rejects.toThrow('Duration must be between 1 and 1440 minutes');
    });
    
    it('should stop existing timer before starting new one', async () => {
      await lifecycle.start(30, 12345);
      await lifecycle.start(60, 12345);
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });
  });
});
```

---

## 📦 REFACTORING ROADMAP

### **Phase 1: Foundation (Week 1-2)**

**Goal:** Establish patterns without breaking existing functionality

**Tasks:**
1. ✅ Create `features/` directory structure
2. ✅ Create coding standards document (this file)
3. ✅ Set up test framework (Vitest + Chrome Extension Testing Library)
4. ✅ Add ESLint with strict rules
5. ✅ Add pre-commit hooks (lint + format)

**Deliverables:**
- [ ] `DEVELOPMENT_STANDARDS.md` (this file)
- [ ] `.eslintrc.json` with rules
- [ ] `vitest.config.js`
- [ ] `package.json` with test scripts

---

### **Phase 2: Extract Core Patterns (Week 3-4)**

**Goal:** Pull out reusable patterns from existing code

**Priority 1: Timer Feature Module**
```bash
# Create structure
mkdir -p extension/features/timer
mkdir -p extension/features/timer/commands
mkdir -p extension/features/timer/state
mkdir -p extension/features/timer/persistence

# Extract from timer-engine.js (683 lines) → 5 files (~150 lines each)
```

**Files to Create:**
1. `timer-lifecycle.js` - Start/stop/pause logic
2. `timer-state.js` - State management & validation
3. `timer-persistence.js` - Save/restore from storage
4. `timer-notifications.js` - Badge/notification updates
5. `timer-coordinator.js` - Compose all pieces

**Tests to Write:**
- [ ] `timer-lifecycle.test.js` (20+ test cases)
- [ ] `timer-state.test.js` (15+ test cases)
- [ ] `timer-persistence.test.js` (10+ test cases)

**Acceptance Criteria:**
- All existing functionality works identically
- 80%+ test coverage on new modules
- File sizes under 200 lines each

---

**Priority 2: Video Control Feature Module**
```bash
mkdir -p extension/features/video-control
mkdir -p extension/features/video-control/strategies
```

**Files to Create:**
1. `video-finder.js` - Unified video finding interface
2. `video-controller.js` - Pause/play/seek operations
3. `strategies/netflix-strategy.js` - Netflix-specific logic
4. `strategies/youtube-strategy.js` - YouTube-specific logic
5. `strategies/base-strategy.js` - Abstract base class

**Extract from streaming-controller.js:**
- Lines 100-600 (platform detection) → `strategies/`
- Lines 661-750 (pause/play) → `video-controller.js`

**Tests:**
- [ ] `video-finder.test.js` (15+ test cases)
- [ ] `strategies/netflix-strategy.test.js` (10+ test cases)

---

### **Phase 3: Eliminate Duplication (Week 5)**

**Goal:** Remove all duplicate code

**Problem Areas:**
1. ❌ Time utilities duplicated in `streaming-controller.js`
2. ❌ Platform detection logic spread across 3 files
3. ❌ Error handling patterns repeated everywhere

**Solution:**
```javascript
// shared/utils/time-utils.js - SINGLE source of truth
// Build step bundles this for content scripts

// shared/platform/platform-detector.js - SINGLE detector
// Both content scripts and service worker use this

// shared/error-handling/error-handler.js - SINGLE handler
export class ErrorHandler {
  static async withRetry(fn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const delays = options.delays || [0, 1000, 2000];
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries) throw error;
        await sleep(delays[i]);
      }
    }
  }
}

// Usage everywhere:
const config = await ErrorHandler.withRetry(
  () => fetchRemoteConfig(),
  { maxRetries: 3 }
);
```

---

### **Phase 4: Add Type Safety (Week 6-8)**

**Goal:** Migrate to TypeScript incrementally

**Strategy: Bottom-up migration**
1. Start with utilities (no dependencies)
2. Move to domain logic
3. Finally convert UI code

**Week 6: Utilities**
```typescript
// shared/utils/time-utils.ts
export function parseTimeInput(input: string): number | null {
  if (!input) return null;
  // Type safety prevents passing numbers by mistake
}

export function formatSecondsToDisplay(seconds: number): string {
  // Guaranteed seconds is a number
}
```

**Week 7: Domain Logic**
```typescript
// features/timer/timer-types.ts
export interface TimerState {
  tabId: number;
  platform: string;
  duration: number;
  remaining: number;
  startTime: Date;
  status: 'active' | 'paused' | 'stopped';  // Type-safe enum
}

// features/timer/timer-lifecycle.ts
export class TimerLifecycle {
  async start(minutes: number, tabId: number): Promise<TimerState> {
    // TypeScript prevents wrong parameter types
  }
}
```

**Week 8: UI Code**
```typescript
// popup/popup.ts
interface PopupState {
  timerActive: boolean;
  remaining: number;
  platform: string | null;
}

let state: PopupState = {
  timerActive: false,
  remaining: 0,
  platform: null
};
```

---

## 🎯 QUALITY GATES

### **Before Committing Code:**
- [ ] Passes ESLint (no warnings)
- [ ] Passes Prettier formatting
- [ ] All tests pass
- [ ] New code has tests (80%+ coverage)
- [ ] No files over 300 lines
- [ ] No functions over 50 lines
- [ ] JSDoc comments on public methods

### **Before Merging to Main:**
- [ ] Manual testing on Chrome
- [ ] Manual testing on Edge (Chromium)
- [ ] No console errors in production build
- [ ] Package size under 500KB
- [ ] All analytics events working

### **Before Releasing:**
- [ ] Version bump in manifest.json
- [ ] CHANGELOG.md updated
- [ ] README.md updated (if API changes)
- [ ] Screenshot updates (if UI changes)
- [ ] Privacy policy reviewed (if data changes)

---

## 🚀 DAILY WORKFLOW

### **Starting New Work:**
```bash
# 1. Create feature branch
git checkout -b feature/timer-refactor

# 2. Create feature folder
mkdir -p extension/features/timer

# 3. Write tests FIRST (TDD)
touch extension/features/timer/timer-lifecycle.test.js

# 4. Write minimal code to pass tests
touch extension/features/timer/timer-lifecycle.js

# 5. Refactor while keeping tests green
```

### **Code Review Checklist:**
**Reviewer must verify:**
- [ ] Code follows naming conventions
- [ ] No duplicate code
- [ ] Functions under 50 lines
- [ ] Files under 300 lines
- [ ] JSDoc on public methods
- [ ] Tests included
- [ ] No console.log (use console.error/warn only)
- [ ] Error handling present
- [ ] Analytics events added (if user-facing)

---

## 📚 REFERENCE EXAMPLES

### **Example 1: Perfect Timer Lifecycle Module**
```javascript
/**
 * Timer Lifecycle Manager
 * 
 * Purpose:
 * - Manages timer creation, start, stop, pause, resume
 * - Handles state validation
 * - Delegates to persistence layer
 * 
 * Dependencies:
 * - TimerRepository (persistence)
 * - TimerValidator (validation)
 * - Analytics (tracking)
 * 
 * Used by:
 * - TimerCoordinator (service worker)
 * 
 * @module features/timer/timer-lifecycle
 */

import { TimerRepository } from './timer-persistence.js';
import { TimerValidator } from './timer-validator.js';
import { trackTimerStart, trackTimerStop } from '../analytics/analytics-events.js';

export class TimerLifecycle {
  constructor(repository = new TimerRepository()) {
    this.repo = repository;
    this.validator = new TimerValidator();
  }
  
  /**
   * Start a new timer
   * 
   * @param {number} minutes - Duration in minutes (1-1440)
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<TimerState>} Created timer
   * @throws {Error} If validation fails
   */
  async start(minutes, tabId) {
    // 1. Validate inputs
    this.validator.validateDuration(minutes);
    await this.validator.validateTab(tabId);
    
    // 2. Stop existing timer (if any)
    await this.stop();
    
    // 3. Create timer state
    const timer = this._createTimerState(minutes, tabId);
    
    // 4. Persist
    await this.repo.save(timer);
    
    // 5. Track analytics
    trackTimerStart(timer.duration, 'manual').catch(() => {});
    
    return timer;
  }
  
  /**
   * Stop the active timer
   * 
   * @returns {Promise<void>}
   */
  async stop() {
    const timer = await this.repo.find();
    if (!timer) return;
    
    // Track how much time was used
    const elapsed = timer.duration - timer.remaining;
    trackTimerStop(elapsed, timer.remaining).catch(() => {});
    
    await this.repo.delete();
  }
  
  /**
   * Create timer state object
   * @private
   */
  _createTimerState(minutes, tabId) {
    return {
      tabId,
      duration: minutes * 60,
      remaining: minutes * 60,
      startTime: Date.now(),
      status: 'active',
      platform: this._detectPlatform(tabId)
    };
  }
}
```

**Why This is Perfect:**
- ✅ Single responsibility (lifecycle only)
- ✅ Dependency injection (testable)
- ✅ Clear documentation
- ✅ Proper error handling
- ✅ Analytics integration
- ✅ Under 100 lines
- ✅ Easy to test
- ✅ Easy to understand

---

### **Example 2: Perfect Test File**
```javascript
/**
 * Tests for TimerLifecycle
 * 
 * Coverage:
 * - Happy path (normal usage)
 * - Error cases (validation failures)
 * - Edge cases (boundary conditions)
 * - Integration (repository interaction)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimerLifecycle } from '../timer-lifecycle.js';
import { TimerRepository } from '../timer-persistence.js';

describe('TimerLifecycle', () => {
  let lifecycle;
  let mockRepo;
  
  beforeEach(() => {
    // Mock repository to avoid real storage
    mockRepo = {
      save: vi.fn(),
      find: vi.fn(),
      delete: vi.fn()
    };
    lifecycle = new TimerLifecycle(mockRepo);
  });
  
  describe('start', () => {
    it('should create timer with correct duration', async () => {
      const timer = await lifecycle.start(30, 12345);
      
      expect(timer.duration).toBe(1800);
      expect(timer.remaining).toBe(1800);
      expect(timer.tabId).toBe(12345);
      expect(timer.status).toBe('active');
    });
    
    it('should save timer to repository', async () => {
      await lifecycle.start(30, 12345);
      
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: 1800,
          tabId: 12345
        })
      );
    });
    
    it('should throw error for invalid duration', async () => {
      await expect(lifecycle.start(0, 12345))
        .rejects.toThrow('Duration must be between 1 and 1440 minutes');
      
      await expect(lifecycle.start(2000, 12345))
        .rejects.toThrow('Duration must be between 1 and 1440 minutes');
    });
    
    it('should stop existing timer before starting new one', async () => {
      mockRepo.find.mockResolvedValue({ duration: 1800 });
      
      await lifecycle.start(30, 12345);
      
      expect(mockRepo.delete).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('stop', () => {
    it('should delete timer from repository', async () => {
      mockRepo.find.mockResolvedValue({ duration: 1800, remaining: 900 });
      
      await lifecycle.stop();
      
      expect(mockRepo.delete).toHaveBeenCalledTimes(1);
    });
    
    it('should do nothing if no active timer', async () => {
      mockRepo.find.mockResolvedValue(null);
      
      await lifecycle.stop();
      
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
```

---

## ✅ SUCCESS METRICS

### **Code Quality Metrics (Automated)**
```json
{
  "eslint": {
    "errors": 0,
    "warnings": 0
  },
  "test_coverage": {
    "overall": ">= 80%",
    "utilities": ">= 100%",
    "business_logic": ">= 85%"
  },
  "complexity": {
    "max_function_lines": 50,
    "max_file_lines": 300,
    "max_cyclomatic": 10
  },
  "duplication": {
    "max_duplicate_lines": 5
  }
}
```

### **Performance Metrics**
- Extension load time: < 100ms
- Timer start latency: < 50ms
- Video pause latency: < 100ms
- Memory usage: < 50MB
- Package size: < 500KB

### **Developer Experience Metrics**
- Time to onboard new developer: < 2 hours
- Time to add new platform: < 1 hour
- Time to fix bug: < 30 minutes (with good tests)

---

## 🎓 LEARNING RESOURCES

### **Required Reading:**
1. **Clean Code** by Robert C. Martin (Chapters 1-5)
2. **Chrome Extension Architecture Best Practices**
   - https://developer.chrome.com/docs/extensions/mv3/architecture-overview/
3. **Design Patterns in JavaScript**
   - Command Pattern
   - Strategy Pattern
   - Repository Pattern

### **Code Review Examples:**
Study these open-source Chrome extensions:
1. **Refined GitHub** - Excellent architecture
2. **uBlock Origin** - Performance optimization
3. **Grammarly** - Content script patterns

---

## 📖 APPENDIX: ESLint Configuration

```json
// .eslintrc.json
{
  "extends": ["eslint:recommended"],
  "env": {
    "browser": true,
    "es2022": true,
    "webextensions": true
  },
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "max-lines": ["error", 300],
    "max-lines-per-function": ["error", 50],
    "max-params": ["error", 5],
    "complexity": ["error", 10],
    "no-console": ["warn", { "allow": ["error", "warn"] }],
    "no-var": "error",
    "prefer-const": "error",
    "no-duplicate-imports": "error",
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"],
    "brace-style": ["error", "1tbs"],
    "semi": ["error", "always"],
    "quotes": ["error", "single"],
    "indent": ["error", 2],
    "no-trailing-spaces": "error"
  }
}
```

---

**END OF DOCUMENT**

**Next Steps:**
1. Review this document with team
2. Set up tooling (ESLint, Vitest, pre-commit hooks)
3. Start Phase 1 refactoring
4. Measure metrics weekly
5. Update this document as patterns evolve
