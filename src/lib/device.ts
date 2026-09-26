/**
 * BaithakOS — Device ID Utility
 *
 * Generates and persists a stable device identifier.
 * This never changes for the lifetime of the browser profile.
 */

const DEVICE_ID_KEY = 'baithak_device_id';

let _cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (_cachedDeviceId) return _cachedDeviceId;

  if (typeof window === 'undefined') {
    // SSR context — return a placeholder
    return 'server';
  }

  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  _cachedDeviceId = id;
  return id;
}

/** For testing only */
export function _resetDeviceId(): void {
  _cachedDeviceId = null;
}
