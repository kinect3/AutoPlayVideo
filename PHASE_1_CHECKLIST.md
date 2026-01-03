# 🎯 Phase 1 Implementation Checklist

**Goal:** Establish foundation and tooling without breaking existing functionality

**Duration:** Week 1-2

---

## ✅ Setup Tasks

### Day 1: Development Environment
- [x] Create DEVELOPMENT_STANDARDS.md
- [x] Create .eslintrc.json with strict rules
- [x] Create .prettierrc.json for formatting
- [x] Create package.json with scripts
- [x] Create vitest.config.js for testing
- [x] Create tests/setup.js for Chrome API mocks
- [x] Create tests/example.test.js as template
- [ ] Install dependencies: `npm install`
- [ ] Test ESLint: `npm run lint`
- [ ] Test Prettier: `npm run format:check`
- [ ] Run example test: `npm test`

### Day 2: Git Hooks & Validation
- [ ] Initialize Husky: `npx husky install`
- [ ] Set up pre-commit hook
- [ ] Test pre-commit workflow (make small change → commit)
- [ ] Update README.md with new workflow instructions
- [ ] Document how to skip hooks (if emergency): `git commit --no-verify`

### Day 3-4: Measure Current State
- [ ] Run ESLint on existing code: `npm run lint > lint-baseline.txt`
- [ ] Count current violations by rule
- [ ] Create exemptions file for gradual migration
- [ ] Document "tech debt" metrics in PROJECT_STATUS.md

### Day 5: Create Feature Module Structure
```bash
mkdir -p extension/features/timer
mkdir -p extension/features/timer/commands
mkdir -p extension/features/timer/state
mkdir -p extension/features/timer/persistence
mkdir -p extension/features/video-control
mkdir -p extension/features/video-control/strategies
mkdir -p extension/features/analytics
mkdir -p extension/shared/utils
mkdir -p extension/shared/types
mkdir -p tests/unit/timer
mkdir -p tests/unit/video-control
mkdir -p tests/integration
```

Tasks:
- [ ] Create directory structure
- [ ] Add README.md to each feature folder explaining purpose
- [ ] Create index.js in each feature as public API

---

## 📦 Migration Tasks

### Week 2: Extract First Module (Timer Persistence)

**Why start here?** Smallest, most isolated, easiest to test.

#### Step 1: Create TimerRepository
- [ ] Create `extension/features/timer/timer-repository.js`
- [ ] Write tests first: `tests/unit/timer/timer-repository.test.js`
- [ ] Implement save/find/delete methods
- [ ] Add JSDoc documentation
- [ ] Run tests: `npm test timer-repository`
- [ ] Verify 100% coverage

#### Step 2: Extract Timer State
- [ ] Create `extension/features/timer/timer-state.js`
- [ ] Define TimerState interface (JSDoc)
- [ ] Create factory function: `createTimerState(minutes, tabId)`
- [ ] Write validation functions
- [ ] Write tests: `tests/unit/timer/timer-state.test.js`
- [ ] Achieve 100% coverage

#### Step 3: Integrate with Existing Code
- [ ] Import TimerRepository in timer-engine.js
- [ ] Replace direct chrome.storage calls with repository
- [ ] Run full test suite: `npm test`
- [ ] Manual test: Start/stop timer in browser
- [ ] Verify no regressions

#### Step 4: Commit & Validate
```bash
git add extension/features/timer/timer-repository.js
git add tests/unit/timer/timer-repository.test.js
git commit -m "Extract timer persistence into repository pattern"
```
- [ ] Pre-commit hooks pass
- [ ] All tests green
- [ ] ESLint clean
- [ ] Push to GitHub

---

## 🔍 Quality Gates

**Before moving to Phase 2, verify:**
- [ ] All npm scripts work (`lint`, `test`, `format`)
- [ ] Pre-commit hooks block bad commits
- [ ] At least 1 complete module extracted and tested
- [ ] Documentation updated
- [ ] Team comfortable with workflow
- [ ] No existing functionality broken

---

## 📊 Success Metrics

Track these weekly:
```markdown
## Week 1
- Files under 300 lines: X/Y (target: 100%)
- Test coverage: X% (target: 80%)
- ESLint errors: X (target: 0)
- Duplicate code blocks: X (target: 0)

## Week 2
- Modules extracted: X (target: 3)
- Tests written: X (target: 50+)
- Documentation pages: X (target: 5)
```

---

## 🚨 Rollback Plan

If anything breaks:
1. Check git log: `git log --oneline -10`
2. Identify last working commit
3. Revert: `git revert <commit-hash>`
4. Or reset (if not pushed): `git reset --hard <commit-hash>`
5. Document what went wrong
6. Adjust checklist

---

## 💡 Tips

**Daily Stand-up Questions:**
- What module did I extract yesterday?
- Did all tests pass?
- Any blockers?
- What module am I extracting today?

**Code Review Focus:**
- Does it follow DEVELOPMENT_STANDARDS.md?
- Are there tests with 80%+ coverage?
- Is documentation clear?
- File under 300 lines?
- Functions under 50 lines?

**Common Pitfalls:**
- Don't refactor without tests first
- Don't extract multiple modules simultaneously
- Don't skip documentation
- Don't commit broken code (hooks will catch it!)

---

## 📚 Next Steps

After Phase 1 complete:
→ Move to PHASE_2_CHECKLIST.md
→ Focus: Extract timer lifecycle logic
→ Target: Break down timer-engine.js (683 → 150 lines each)
