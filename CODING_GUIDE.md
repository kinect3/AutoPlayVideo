# ⚙️ How to Write Code Going Forward

**Quick Reference Guide - Keep This Open While Coding**

---

## 🔗 Part of the Development System

```
📊 PRODUCT_DEVELOPMENT_GUIDE.md → What to build
    ↓
🏗️ DEVELOPMENT_STANDARDS.md → Architecture & patterns
    ↓
📝 CODING_GUIDE.md (This document) → Daily coding
    ↓
💬 COMMUNICATION_PROTOCOL.md → Working with AI
```

**See also:**
- [PRODUCT_DEVELOPMENT_GUIDE.md](PRODUCT_DEVELOPMENT_GUIDE.md) - Full development lifecycle
- [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) - Architectural standards
- [COMMUNICATION_PROTOCOL.md](COMMUNICATION_PROTOCOL.md) - How to ask for help

---

## 🎯 Before Writing Any Code

**Ask These 4 Questions:**
1. **What is the single responsibility of this code?**
   - If you can't answer in one sentence → split it up
   
2. **What layer does this belong to?**
   - UI Layer (popup, settings) → user interaction only
   - Business Logic (service-worker) → coordination only
   - Domain Logic (timer-engine) → core behavior only
   - Utilities → pure functions only
   
3. **Does this already exist somewhere?**
   - Search codebase first: `grep -r "functionName" extension/`
   - Don't duplicate code
   
4. **How will I test this?**
   - If you can't test it easily → refactor first

---

## 📝 Code Writing Checklist

**For Every New Function:**
```javascript
/**
 * [What does this do in one sentence]
 * 
 * @param {type} paramName - Description
 * @returns {type} Description
 * @throws {Error} When this throws
 * 
 * @example
 * const result = myFunction(input);
 */
export function myFunction(paramName) {
  // 1. Validate inputs early
  if (!paramName) {
    throw new Error('paramName is required');
  }
  
  // 2. Single clear purpose
  const result = doOneThing(paramName);
  
  // 3. Return immediately
  return result;
}
```

**Checklist:**
- [ ] JSDoc comment present
- [ ] Input validation at top
- [ ] Single return point preferred
- [ ] Under 50 lines
- [ ] No more than 5 parameters
- [ ] Named descriptively (verb + noun)

---

## 🏗️ Creating New Files

**Template:**
```javascript
/**
 * [Module Name] - [One line description]
 * 
 * Purpose:
 * - What this file does
 * - Why it exists
 * 
 * Dependencies:
 * - module-name (what you import)
 * 
 * Used by:
 * - parent-module (who imports this)
 * 
 * @module features/timer/timer-lifecycle
 */

import { dependency } from '../shared/utils.js';

// Constants at top
const DEFAULT_DURATION = 1800;
const MAX_DURATION = 86400;

// Main exports
export class MyClass {
  // implementation
}

export function myFunction() {
  // implementation
}
```

**Checklist:**
- [ ] File header with module documentation
- [ ] Imports at top
- [ ] Constants after imports
- [ ] Exports clearly defined
- [ ] Under 300 lines
- [ ] One primary export (class or function group)

---

## 🧪 Writing Tests

**Test-Driven Development (TDD) Flow:**
```javascript
// 1. Write test FIRST (it will fail)
describe('MyFunction', () => {
  it('should do the thing correctly', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});

// 2. Write MINIMAL code to pass test
export function myFunction(input) {
  return 'expected'; // hardcoded
}

// 3. Refactor while keeping tests green
export function myFunction(input) {
  return processInput(input); // real implementation
}
```

**Test Coverage Rules:**
- Utilities: 100% coverage
- Business logic: 80% coverage
- UI code: 50% coverage (use integration tests)

**Test Structure:**
```javascript
describe('FeatureName', () => {
  let instance;
  let mockDependency;
  
  beforeEach(() => {
    // Setup before each test
    mockDependency = createMock();
    instance = new MyClass(mockDependency);
  });
  
  describe('methodName', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = instance.methodName(input);
      
      // Assert
      expect(result).toBe('expected');
    });
    
    it('should throw error for invalid input', () => {
      expect(() => instance.methodName(null))
        .toThrow('Input required');
    });
  });
});
```

---

## 🎨 Naming Guidelines

**Variables:**
```javascript
// ✅ Good
const timerDuration = 60;
const isActive = true;
const hasPermission = false;
const userSettings = {};

// ❌ Bad
const dur = 60;           // Too short
const active = true;       // Missing 'is'
const x = {};             // Meaningless
```

**Functions:**
```javascript
// ✅ Good - Verb + Noun
function startTimer() {}
function calculateDuration() {}
function validateInput() {}
function formatTimestamp() {}

// ❌ Bad
function timer() {}        // Not a verb
function process() {}      // Too vague
function doStuff() {}      // Meaningless
```

**Files:**
```javascript
// ✅ Good - Kebab case, descriptive
timer-lifecycle.js
video-controller.js
analytics-client.js

// ❌ Bad
timerlifecycle.js          // Hard to read
timer.js                   // Too vague
t.js                       // Meaningless
```

---

## 🔄 Refactoring Workflow

**When You See Bad Code:**
```javascript
// 1. Don't fix immediately - create ticket
// Add to TECH_DEBT.md:
// - [ ] Refactor parseTimeInput (duplicated in 3 files)

// 2. Is it blocking your work?
//    YES → Fix it now with tests
//    NO  → Continue and fix in dedicated refactoring sprint

// 3. If fixing now:
//    a. Write test for current behavior (characterization test)
//    b. Refactor code
//    c. Verify test still passes
//    d. Commit: "Refactor: extract parseTimeInput to utils"
```

---

## 🚫 Anti-Patterns to Avoid

### ❌ God Objects
```javascript
// BAD: One class does everything (683 lines)
class TimerEngine {
  startTimer() {}
  stopTimer() {}
  pauseTimer() {}
  validateTimer() {}
  saveTimer() {}
  loadTimer() {}
  notifyUser() {}
  updateBadge() {}
  // ... 40 more methods
}
```

### ✅ Single Responsibility
```javascript
// GOOD: Each class has one job
class TimerLifecycle {
  start() {}
  stop() {}
  pause() {}
}

class TimerPersistence {
  save() {}
  load() {}
}

class TimerNotifications {
  notifyUser() {}
  updateBadge() {}
}
```

---

### ❌ Callback Hell
```javascript
// BAD: Nested callbacks
chrome.storage.local.get('timer', (result) => {
  chrome.tabs.query({}, (tabs) => {
    chrome.runtime.sendMessage({}, (response) => {
      // 3 levels deep
    });
  });
});
```

### ✅ Async/Await
```javascript
// GOOD: Flat async/await
async function loadTimer() {
  const result = await chrome.storage.local.get('timer');
  const tabs = await chrome.tabs.query({});
  const response = await chrome.runtime.sendMessage({});
  return response;
}
```

---

### ❌ Magic Numbers
```javascript
// BAD
if (duration > 86400) {
  // What is 86400?
}
```

### ✅ Named Constants
```javascript
// GOOD
const SECONDS_PER_DAY = 86400;

if (duration > SECONDS_PER_DAY) {
  // Clear intent
}
```

---

## 📊 Daily Self-Review

**Before Committing, Check:**
- [ ] Does this follow Single Responsibility Principle?
- [ ] Is there JSDoc documentation?
- [ ] Are there tests (80%+ coverage)?
- [ ] Is file under 300 lines?
- [ ] Are functions under 50 lines?
- [ ] No console.log (only console.error/warn)?
- [ ] No duplicate code?
- [ ] Clear variable names?
- [ ] No magic numbers?

**Run Automated Checks:**
```bash
npm run lint          # Check code style
npm run format:check  # Check formatting
npm run test          # Run tests
```

---

## 🎓 Learning Path

**Week 1-2: Master the Basics**
- Read DEVELOPMENT_STANDARDS.md fully
- Write 5 small utility functions with tests
- Practice TDD: test first, then implement

**Week 3-4: Understand Patterns**
- Study Command Pattern example in standards doc
- Study Strategy Pattern example in standards doc
- Refactor one existing file using a pattern

**Week 5+: Build Features**
- Create new feature modules from scratch
- Follow feature module structure
- Aim for 90%+ test coverage

---

## 💬 Questions? Use This Decision Tree

```
Do I need to write code?
├─ YES → Does similar code exist?
│  ├─ YES → Refactor and reuse
│  └─ NO → Continue
│
└─ Is it > 50 lines?
   ├─ YES → Split into smaller functions
   └─ NO → Continue
   
Can I describe its purpose in one sentence?
├─ NO → Too complex, split it up
└─ YES → Continue

Can I test this easily?
├─ NO → Refactor to make testable
└─ YES → Write test first, then implement

Does it follow naming conventions?
├─ NO → Rename before committing
└─ YES → Good to go!
```

---

**Remember:** Clean code is not about being clever, it's about being **clear**.

**When in doubt:** Make it work → Make it right → Make it fast (in that order!)
