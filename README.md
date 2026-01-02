<p align="center">
  <img src="extension/assets/icons/android-chrome-192x192.png" alt="Viboot Logo" width="100" height="100">
</p>

<h1 align="center">Viboot</h1>

<p align="center">
  <strong>Sleep Timer for Streaming Platforms</strong><br>
  <em>Don't binge. Sleep better.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0-blue.svg" alt="Version 2.0">
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-MIT-purple.svg" alt="MIT License">
</p>

---

## 🌙 Our Mission

> **"Your sleep is priceless. Our tools are free."**

We believe everyone deserves a good night's rest without needing to pay for basic digital wellness. Viboot exists to help you take control of your streaming habits and prioritize your health—completely free, forever.

---

## 📖 What is Viboot?

Viboot is a free Chrome extension that adds a **sleep timer** to all your favorite streaming platforms. Set a timer, and when it expires, your video automatically pauses—helping you fall asleep without worrying about endless autoplay.

Whether you're watching Netflix to wind down, listening to YouTube videos as background noise, or catching up on your favorite shows on Disney+, Viboot ensures your screen won't run all night.

---

## 🎯 Who Is This For?

| User | Problem | How Viboot Helps |
|------|---------|------------------|
| **Night Owls** | "I always say just one more episode..." | Timer forces a natural stopping point |
| **Parents** | Kids fall asleep watching content | Video pauses automatically, saves screen time |
| **Light Sleepers** | Screen light/sound disrupts sleep | Content stops, darkness returns |
| **Data-Conscious Users** | Streaming all night wastes bandwidth | Stops unnecessary data usage |
| **Mindful Watchers** | Want to reduce screen time | Built-in accountability tool |

---

## ✨ Features

### 🕐 Flexible Timer Options

**Quick Presets**
- 6 customizable preset buttons for instant timer setting
- Default presets: 15m, 30m, 45m, 1h, 1h 30m, 2h
- Edit presets anytime in Settings to match your routine

**Custom Duration**
- Set any duration from **1 second to 24 hours**
- Natural input format: `30s`, `5m`, `1h 30m`, `2h 15m 30s`
- Perfect for specific sleep schedules

### 📺 Universal Platform Support

| Platform | Support Level | Features |
|----------|--------------|----------|
| Netflix | ⭐ Optimized | Video pause, overlay |
| YouTube | ⭐ Optimized | Standard videos + Shorts |
| Disney+ | ⭐ Optimized | Full player control |
| Amazon Prime Video | ⭐ Optimized | Shadow DOM support |
| HBO Max / Max | ⭐ Optimized | Full integration |
| Crunchyroll | ⭐ Optimized | Anime-ready |
| Twitch | ⭐ Optimized | Live stream support |
| Hulu | ⭐ Optimized | Full player control |
| **Any Website** | ✅ Generic | Works with any HTML5 video |

### ⏱️ Timer Controls

- **Visual Countdown** — Large, easy-to-read timer display with progress ring
- **Extend Timer** — Add 10 minutes anytime with one click
- **Stop Timer** — Cancel immediately when needed
- **Badge Indicator** — Chrome toolbar shows remaining minutes

### 🖼️ On-Screen Overlay

- Subtle floating timer appears on your video
- See remaining time without opening the popup
- Can be disabled in Settings for distraction-free viewing

### 🔔 Smart Notifications

- Desktop notification when timer expires
- Gentle reminder that it's time to sleep
- Can be disabled for silent operation

### 🎨 Theme Support

- **Dark Mode** — Easy on the eyes at night (default)
- **Light Mode** — For daytime use with enhanced contrast
- Theme preference is remembered

### 🖱️ Right-Click Context Menu

- Quick timer access without opening the popup
- Right-click anywhere on a streaming page
- All your presets available in the menu
- Custom duration option included

### 💾 Persistent Timer

- Timer survives browser restart
- Timer continues if popup is closed
- Timer persists through service worker sleep
- Close the tab? Timer stops cleanly

### ⚙️ Customizable Settings

| Setting | Description |
|---------|-------------|
| Show Overlay | Toggle the on-video timer display |
| Show Notifications | Toggle expiry notifications |
| Quick Presets | Fully customize all 6 preset buttons |

---

## 🚀 Installation

### From Chrome Web Store
1. Visit the [Viboot Chrome Web Store page](#) *(coming soon)*
2. Click "Add to Chrome"
3. Done! Click the Viboot icon to get started

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `extension` folder from this project
6. Pin Viboot to your toolbar for easy access

---

## 📱 How to Use

### Starting a Timer

1. **Navigate** to any supported streaming platform
2. **Click** the Viboot icon in your toolbar
3. **Choose** a preset button OR enter a custom duration
4. **Relax** — your video will pause when time's up

### Timer Controls

| Action | How |
|--------|-----|
| Start | Click preset or type duration + "Set" |
| Extend | Click "+10 min" button |
| Stop | Click "Stop" button |
| Check time | Look at popup or on-video overlay |

### Using Context Menu

1. **Right-click** anywhere on a streaming page
2. **Hover** over "⏱️ Set Timer"
3. **Select** a preset or "Custom Duration..."

### Customizing Presets

1. Open Viboot popup
2. Click "⚙️ Settings"
3. Click "✏️ Edit" next to Quick Presets
4. Enter new values (e.g., `20m`, `1h 15m`)
5. Click "💾 Save"

---

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
├──────────────┬──────────────────┬───────────────────────┤
│    Popup     │  Background SW   │   Content Scripts     │
│  (popup.js)  │ (service-worker) │ (streaming-controller)│
├──────────────┼──────────────────┼───────────────────────┤
│ • UI/UX      │ • Timer Engine   │ • Video Detection     │
│ • Settings   │ • Chrome Alarms  │ • Pause Control       │
│ • Presets    │ • Tab Management │ • Overlay Display     │
│ • Theme      │ • Notifications  │ • Platform Adapters   │
└──────────────┴──────────────────┴───────────────────────┘
```

### Key Technologies

- **Manifest V3** — Latest Chrome extension standard
- **Chrome Alarms API** — Timer survives service worker sleep
- **Chrome Storage API** — Persistent settings and timer state
- **MutationObserver** — Reliable video detection
- **CSS Variables** — Seamless theme switching

---

## 🔒 Privacy & Permissions

Viboot requests only the minimum permissions needed:

| Permission | Why It's Needed |
|------------|-----------------|
| `storage` | Save your settings and timer state |
| `alarms` | Keep timer running in background |
| `activeTab` | Access current tab to control video |
| `scripting` | Inject pause commands when needed |
| `notifications` | Show expiry alerts |
| `contextMenus` | Right-click menu functionality |

**We do NOT:**
- Collect any personal data
- Track your viewing habits
- Send data to external servers
- Require account creation
- Show advertisements

---

## 🛠️ Development

### Project Structure

```
Viboot/
├── extension/
│   ├── manifest.json          # Extension configuration
│   ├── popup/                 # Popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── background/            # Service worker
│   │   ├── service-worker.js
│   │   └── timer-engine.js
│   ├── content/               # Content scripts
│   │   └── streaming-controller.js
│   ├── utils/                 # Utilities
│   │   ├── storage.js
│   │   └── config-manager.js
│   └── assets/                # Icons and sounds
├── server/                    # Optional config API
└── README.md
```

### Building & Testing

```bash
# No build step required - pure JavaScript
# Just load the extension folder in Chrome

# For the optional config server:
cd server
npm install
npm start
```

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report Bugs** — Open an issue with steps to reproduce
2. **Suggest Features** — We'd love to hear your ideas
3. **Submit PRs** — Code improvements are always welcome
4. **Spread the Word** — Tell others about Viboot

---

## 📜 License

MIT License — Free to use, modify, and distribute.

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/kckinect/Viboot/issues)
- **Email:** *(coming soon)*

---

<p align="center">
  <strong>Made with 😴 for better sleep</strong><br>
  <em>Because everyone deserves to rest well.</em>
</p>

<p align="center">
  <a href="https://github.com/kckinect/Viboot">⭐ Star us on GitHub</a>
</p>
