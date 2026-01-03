/**
 * Example Test File - Template for Future Tests
 * 
 * This file demonstrates proper test structure and patterns.
 * Copy this template when creating new test files.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Example Test Suite', () => {
  // Setup runs before each test
  beforeEach(() => {
    // Reset state, clear mocks, etc.
  });
  
  describe('Basic Assertions', () => {
    it('should pass basic equality checks', () => {
      expect(1 + 1).toBe(2);
      expect('hello').toEqual('hello');
      expect([1, 2, 3]).toHaveLength(3);
    });
    
    it('should handle async operations', async () => {
      const result = await Promise.resolve(42);
      expect(result).toBe(42);
    });
  });
  
  describe('Chrome API Mocking', () => {
    it('should mock chrome.storage.local.get', async () => {
      chrome.storage.local.get.mockResolvedValue({ key: 'value' });
      
      const result = await chrome.storage.local.get('key');
      
      expect(result).toEqual({ key: 'value' });
      expect(chrome.storage.local.get).toHaveBeenCalledWith('key');
    });
    
    it('should mock chrome.runtime.sendMessage', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      const response = await chrome.runtime.sendMessage({ action: 'test' });
      
      expect(response.success).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    it('should catch and test errors', async () => {
      const failingFunction = async () => {
        throw new Error('Expected error');
      };
      
      await expect(failingFunction()).rejects.toThrow('Expected error');
    });
  });
  
  describe('Spy Usage', () => {
    it('should spy on function calls', () => {
      const mockCallback = vi.fn(x => x * 2);
      
      mockCallback(5);
      mockCallback(10);
      
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenCalledWith(5);
      expect(mockCallback).toHaveBeenLastCalledWith(10);
      expect(mockCallback).toHaveReturnedWith(20);
    });
  });
});
