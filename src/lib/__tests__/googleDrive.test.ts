import { describe, it, expect, beforeEach } from 'vitest';
import {
  getGoogleDriveConfig,
  saveGoogleDriveConfig,
  disconnectGoogleDrive,
  isGoogleDriveConnected,
  type GoogleDriveConfig,
} from '@/lib/cloud/googleDrive';

describe('Google Drive Sync Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false for connected when not configured', () => {
    expect(isGoogleDriveConnected()).toBe(false);
    expect(getGoogleDriveConfig()).toBeNull();
  });

  it('saves and reads Google Drive config', () => {
    const config: GoogleDriveConfig = {
      accessToken: 'test-token-12345',
      tokenExpiresAt: Date.now() + 3600 * 1000,
      userEmail: 'shopkeeper@gmail.com',
      folderId: 'folder-abc-123',
    };

    saveGoogleDriveConfig(config);
    expect(isGoogleDriveConnected()).toBe(true);

    const saved = getGoogleDriveConfig();
    expect(saved?.accessToken).toBe('test-token-12345');
    expect(saved?.userEmail).toBe('shopkeeper@gmail.com');
  });

  it('detects expired tokens and pauses connection', () => {
    const expiredConfig: GoogleDriveConfig = {
      accessToken: 'expired-token',
      tokenExpiresAt: Date.now() - 1000, // already expired
      userEmail: 'shopkeeper@gmail.com',
    };

    saveGoogleDriveConfig(expiredConfig);
    expect(isGoogleDriveConnected()).toBe(false);
  });

  it('clears config on disconnect', () => {
    saveGoogleDriveConfig({
      accessToken: 'valid-token',
      tokenExpiresAt: Date.now() + 3600 * 1000,
    });
    expect(isGoogleDriveConnected()).toBe(true);

    disconnectGoogleDrive();
    expect(isGoogleDriveConnected()).toBe(false);
    expect(getGoogleDriveConfig()).toBeNull();
  });
});
