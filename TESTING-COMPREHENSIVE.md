# Viboot Extension - Comprehensive Pre-Publish Testing Guide

## Version: 2.0

---

## Pre-Publish Checklist

### ✅ Extension Setup
- [ ] Load extension in Chrome via `chrome://extensions` (Developer mode)
- [ ] Verify no errors in the extension card
- [ ] Check that the extension icon appears in the toolbar
- [ ] Verify badge shows nothing initially (no active timer)

---

## 1. Basic Timer Functionality

### 1.1 Start Timer from Popup
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Preset button | Click any preset (e.g., 15m) | Timer starts, badge shows minutes | |
| Custom input (seconds) | Type `45s` → Click Set | Timer starts with 45 seconds | |
| Custom input (minutes) | Type `5m` → Click Set | Timer starts with 5 minutes | |
| Custom input (hours) | Type `1h 30m` → Click Set | Timer starts with 1.5 hours | |
| Custom input (combined) | Type `1h 30m 45s` → Click Set | Timer starts correctly | |
| Invalid input | Type `abc` → Click Set | Error message appears (inline, not alert) | |
| Negative input | Type `-5m` → Click Set | Error message appears | |
| Too long input | Type `25h` → Click Set | Error (max 24 hours) | |

### 1.2 Timer Display
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Countdown updates | Start timer, watch display | Counts down every second | |
| Ring progress | Start timer, watch ring | Ring depletes as time passes | |
| Badge updates | Start timer, watch badge | Shows remaining minutes | |
| Controls appear | Start timer | Stop/Extend buttons visible | |

### 1.3 Timer Controls
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Extend timer | Click +10 button | Timer adds 10 minutes | |
| Stop timer | Click Stop button | Timer stops, display resets | |
| Multiple extends | Click +10 three times | Timer adds 30 minutes total | |

---

## 2. Timer Expiration

### 2.1 Video Pause
| Test | Platform | Steps | Expected Result | ✓ |
|------|----------|-------|-----------------|---|
| Netflix | Netflix | Start 15s timer on video | Video pauses when timer expires | |
| YouTube | YouTube | Start 15s timer on video | Video pauses when timer expires | |
| Amazon Prime | Prime Video | Start 15s timer on video | Video pauses when timer expires | |
| Disney+ | Disney+ | Start 15s timer on video | Video pauses when timer expires | |
| Generic site | Any video site | Start 15s timer | Video pauses via fallback | |

### 2.2 Notifications
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Expiry notification | Let timer expire | System notification appears | |
| Notification disabled | Turn off notifications in settings | No notification on expiry | |

### 2.3 Overlay
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Overlay appears | Start timer on supported platform | Overlay shows remaining time | |
| Overlay countdown | Watch overlay | Updates every second | |
| Overlay disappears | Let timer expire | Overlay removes after 2 seconds | |
| Overlay disabled | Turn off overlay in settings | No overlay appears | |

---

## 3. Multiple Windows/Popups (CRITICAL)

### 3.1 Synchronization
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Second popup shows timer | Open popup A, start timer, open popup B | Both show same time | |
| Both update together | Watch both popups | Both count down in sync | |
| Stop from popup B | Stop timer from popup B | Both popups show inactive | |
| Close and reopen | Start timer, close popup, reopen | Timer still running | |
| No freezing | Open 2 popups with timer | Neither freezes | |

---

## 4. Context Menu (Right-Click)

### 4.1 Menu Functionality
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Menu appears | Right-click on video/page | "Set Timer" submenu appears | |
| Preset options | Open submenu | All 6 presets listed | |
| Start from preset | Click preset from menu | Timer starts | |
| Custom option | Click "Custom Duration..." | Prompt appears | |
| Custom input | Enter duration in prompt | Timer starts | |

---

## 5. Settings

### 5.1 Settings Panel
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Toggle settings | Click ⚙️ Settings | Panel expands/collapses | |
| Show overlay toggle | Toggle on/off | Setting persists on reload | |
| Show notifications toggle | Toggle on/off | Setting persists on reload | |

### 5.2 Custom Presets
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Open preset editor | Click ✏️ Edit | Preset inputs appear | |
| Edit preset | Change preset 1 to `20m` | Input updates | |
| Save presets | Click 💾 Save | Presets update in main grid | |
| Reset presets | Click ↩️ Reset | Reverts to defaults | |
| Presets persist | Edit presets, close popup, reopen | Custom presets remain | |
| Context menu updates | Edit presets, right-click page | Context menu shows new presets | |

---

## 6. Platform Detection

### 6.1 Badge Display
| Site | Expected Badge | Color | ✓ |
|------|----------------|-------|---|
| netflix.com | Netflix | Green | |
| youtube.com | YouTube | Green | |
| disneyplus.com | Disney+ | Green | |
| primevideo.com | Prime Video | Green | |
| max.com | Max | Green | |
| crunchyroll.com | Crunchyroll | Green | |
| twitch.tv | Twitch | Green | |
| hulu.com | Hulu | Green | |
| reddit.com | Reddit | Yellow (generic) | |
| any other site | Site name | Yellow (generic) | |

---

## 7. Edge Cases & Resilience

### 7.1 Tab Management
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Close timer tab | Start timer, close the video tab | Timer stops, badge clears | |
| Navigate away | Start timer, navigate to different site | Timer continues | |
| Refresh page | Start timer, refresh video page | Timer continues | |

### 7.2 Service Worker Sleep
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Browser idle | Start long timer, leave browser idle 2+ min | Timer continues correctly | |
| Reopen popup | After idle period, open popup | Shows correct remaining time | |

### 7.3 Browser Restart
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Restore timer | Start timer, close Chrome, reopen | Timer resumes if tab exists | |
| Tab closed | Start timer, close Chrome, reopen (tab gone) | Timer cleaned up | |

---

## 8. Theme & UI

### 8.1 Theme Toggle
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Toggle to light | Click theme button (☀️) | UI switches to light theme | |
| Toggle to dark | Click theme button (🌙) | UI switches to dark theme | |
| Theme persists | Switch theme, close popup, reopen | Theme setting preserved | |

### 8.2 Responsive Design
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Popup dimensions | Open popup | Fits content, no scrollbar needed | |
| Long preset | Set preset to 23h 59m 59s | Button text doesn't overflow | |

---

## 9. Error Handling

### 9.1 Graceful Failures
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| No active tab | Start timer on chrome:// page | Error message, no crash | |
| Content script unavailable | Timer expires on non-video page | Fallback pause attempted | |
| Server unreachable | Block network, start timer | Works offline (cached config) | |

---

## 10. Console Checks

### 10.1 No Errors in Console
Open DevTools (F12) and check for errors in:
- [ ] Popup console (right-click popup → Inspect)
- [ ] Background/Service Worker console (`chrome://extensions` → Inspect views: service worker)
- [ ] Content script console (on video page)

### Expected Logs (informational, not errors):
```
[Viboot] Starting timer for Xs on tab Y
[Viboot] Timer expired! Pausing video...
[Viboot] Video paused successfully
[Viboot] Timer restored: X min remaining
[Viboot] Content script unavailable, using fallback  (OK if on non-video page)
```

### Unacceptable Errors:
```
Uncaught TypeError: ...
Cannot read properties of undefined...
Failed to execute...
```

---

## Quick Smoke Test (5 minutes)

Complete these 10 checks before publishing:

1. [ ] Open YouTube, play a video
2. [ ] Click extension icon → Click "15m" preset
3. [ ] Verify badge shows "15"
4. [ ] Click +10 → Badge shows "25"
5. [ ] Click Stop → Badge clears
6. [ ] Start 15s timer → Wait for expiry
7. [ ] Verify video pauses and notification appears
8. [ ] Open Settings → Toggle overlay off → Close and reopen → Setting persists
9. [ ] Right-click on page → Verify context menu works
10. [ ] Open second popup window → Both show same timer (no freeze!)

---

## Final Approval Checklist

### Must Pass:
- [ ] All smoke tests pass
- [ ] No console errors (red)
- [ ] Multiple window sync works without freezing
- [ ] Timer expiry pauses video on at least 2 platforms
- [ ] Settings persist correctly
- [ ] Context menu works
- [ ] Theme toggle works

### Nice to Have:
- [ ] Overlay displays on video
- [ ] All 8+ platforms work
- [ ] Custom timer prompt works via context menu

---

## Publishing Information

**Extension Name:** Viboot - Stream Control  
**Version:** 2.0  
**Description:** Sleep timer for streaming platforms. Don't binge. Sleep better.  

**Supported Platforms:**
- Netflix
- YouTube  
- Disney+
- Amazon Prime Video
- HBO Max / Max
- Crunchyroll
- Twitch
- Hulu
- Any site with HTML5 video (generic support)

**Key Features:**
- Customizable timer presets
- Right-click context menu
- Dark/Light theme
- Timer overlay on video
- Desktop notifications
- Works across browser windows
- Survives browser restart
