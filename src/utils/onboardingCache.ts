/**
 * Onboarding Cache Utility
 * Provides fast, persistent caching for onboarding data
 * Prevents unnecessary loading and preserves user input
 */

import type { Asset } from '../types';

interface OnboardingCacheData {
  timestamp: number;
  profile: {
    age?: string;
    income?: string;
    expense?: string;
    savings?: string;
  };
  assets: Asset[];
  selectedAssetTypes: string[];
  pinSet?: boolean;
}

const CACHE_KEY = 'aurafin_onboarding_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save onboarding data to cache
 */
export const saveOnboardingCache = (data: Partial<OnboardingCacheData>) => {
  try {
    const existing = getOnboardingCache();
    const merged = {
      ...existing,
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    return true;
  } catch (error) {
    console.warn('Failed to save onboarding cache:', error);
    return false;
  }
};

/**
 * Get cached onboarding data
 */
export const getOnboardingCache = (): OnboardingCacheData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data = JSON.parse(cached) as OnboardingCacheData;
    
    // Check if cache is expired
    if (Date.now() - data.timestamp > CACHE_DURATION) {
      clearOnboardingCache();
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to read onboarding cache:', error);
    clearOnboardingCache();
    return null;
  }
};

/**
 * Get only the assets from cache
 */
export const getCachedAssets = (): Asset[] => {
  const cache = getOnboardingCache();
  return cache?.assets || [];
};

/**
 * Check if cache exists and is valid
 */
export const hasValidOnboardingCache = (): boolean => {
  return getOnboardingCache() !== null;
};

/**
 * Clear onboarding cache
 */
export const clearOnboardingCache = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
    return true;
  } catch (error) {
    console.warn('Failed to clear onboarding cache:', error);
    return false;
  }
};

/**
 * Merge and save assets to cache
 */
export const updateCachedAssets = (newAssets: Asset[]) => {
  const cache = getOnboardingCache() || {
    profile: {},
    assets: [],
    selectedAssetTypes: [],
    timestamp: Date.now(),
  };

  // Merge with existing assets (update by id or add new)
  const assetMap = new Map(cache.assets.map((a) => [a.id, a]));
  newAssets.forEach((asset) => assetMap.set(asset.id, asset));

  cache.assets = Array.from(assetMap.values());
  saveOnboardingCache(cache);
};

/**
 * Get cached asset by ID
 */
export const getCachedAssetById = (id: string): Asset | undefined => {
  const cache = getOnboardingCache();
  return cache?.assets.find((a) => a.id === id);
};

/**
 * Remove asset from cache
 */
export const removeAssetFromCache = (id: string) => {
  const cache = getOnboardingCache();
  if (!cache) return;

  cache.assets = cache.assets.filter((a) => a.id !== id);
  saveOnboardingCache(cache);
};

/**
 * Get cache statistics
 */
export const getOnboardingCacheStats = () => {
  const cache = getOnboardingCache();
  if (!cache) return null;

  const ageMs = Date.now() - cache.timestamp;
  const ageMinutes = Math.floor(ageMs / 60000);

  return {
    hasProfile: Object.values(cache.profile).some((v) => v),
    assetCount: cache.assets.length,
    selectedAssetTypes: cache.selectedAssetTypes.length,
    isPinSet: cache.pinSet || false,
    ageMinutes,
    expiresIn: Math.max(0, CACHE_DURATION - ageMs),
  };
};
