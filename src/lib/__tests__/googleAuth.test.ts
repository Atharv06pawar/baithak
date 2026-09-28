import { describe, it, expect, beforeEach } from 'vitest';
import { instantGoogleLink } from '@/lib/cloud/googleAuth';
import { getGoogleDriveConfig } from '@/lib/cloud/googleDrive';

beforeEach(() => {
  localStorage.clear();
});

describe('Unified Google Authentication & Backup Link', () => {
  it('validates email address', async () => {
    const res = await instantGoogleLink('');
    expect(res.success).toBe(false);
    expect(res.message).toContain('valid Google email');
  });

  it('configures Google Drive backup environment using the authenticated email', async () => {
    const testEmail = 'shopowner@gmail.com';
    const res = await instantGoogleLink(testEmail, 'Ramesh Owner');

    expect(res.success).toBe(true);
    expect(res.email).toBe(testEmail);
    expect(res.name).toBe('Ramesh Owner');

    // Verify Google Drive configuration was simultaneously linked
    const driveConfig = getGoogleDriveConfig();
    expect(driveConfig).not.toBeNull();
    expect(driveConfig?.userEmail).toBe(testEmail);
    expect(driveConfig?.accessToken).toBeDefined();
  });
});
