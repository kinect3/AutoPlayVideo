/**
 * Test Setup - Global Configuration for Vitest
 * 
 * Purpose:
 * - Mock Chrome Extension APIs
 * - Set up global test utilities
 * - Configure test environment
 */

import { vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  runtime: {
    sendMessage: vi.fn((message, callback) => {
      if (callback) {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    lastError: null,
    id: 'test-extension-id'
  },
  
  storage: {
    local: {
      get: vi.fn(keys => {
        return Promise.resolve({});
      }),
      set: vi.fn(items => {
        return Promise.resolve();
      }),
      remove: vi.fn(keys => {
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        return Promise.resolve();
      })
    }
  },
  
  tabs: {
    query: vi.fn(() => {
      return Promise.resolve([{ id: 12345, url: 'https://netflix.com' }]);
    }),
    sendMessage: vi.fn((tabId, message, callback) => {
      if (callback) {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    get: vi.fn(tabId => {
      return Promise.resolve({ id: tabId, url: 'https://netflix.com' });
    })
  },
  
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    get: vi.fn(),
    onAlarm: {
      addListener: vi.fn()
    }
  },
  
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn()
  }
};

// Mock window.matchMedia for CSS media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Global test utilities
global.sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

global.waitFor = async (condition, timeout = 5000) => {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout exceeded');
    }
    await sleep(50);
  }
};

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
