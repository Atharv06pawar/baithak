/**
 * BaithakOS — Google Drive Cloud Backup & Sync Engine
 *
 * Replaces external database requirements with the shopkeeper's personal Google Drive:
 * 1. 100% Free: Uses the shopkeeper's free 15 GB Google Drive storage.
 * 2. Automatic Environment: Automatically creates a "BaithakOS Backups" folder on Drive.
 * 3. 5-Minute Auto-Sync: Updates every 5 minutes in the background when connected to internet.
 * 4. Silent Offline Pause: If offline or disconnected, sync pauses silently without disturbing the shopkeeper.
 * 5. Full Data Ownership: The shopkeeper owns the backup file in their own Google account.
 */

import { exportShopBackup, restoreShopBackup, type ShopBackupData } from '@/lib/backup';
import type { UUID } from '@/lib/types';

const DRIVE_CONFIG_KEY = 'baithak_google_drive_config';
const DRIVE_FOLDER_NAME = 'BaithakOS Backups';
const DRIVE_FILE_PREFIX = 'baithak_shop_';

export interface GoogleDriveConfig {
  accessToken: string;
  tokenExpiresAt: number; // timestamp
  userEmail?: string;
  folderId?: string;
  clientId?: string;
}

export interface DriveSyncStatus {
  state: 'synced' | 'syncing' | 'paused_offline' | 'disconnected' | 'error';
  label: string;
  lastSyncTime?: number;
}

/** Retrieve stored Google Drive configuration */
export function getGoogleDriveConfig(): GoogleDriveConfig | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(DRIVE_CONFIG_KEY);
  if (!saved) return null;
  try {
    const config: GoogleDriveConfig = JSON.parse(saved);
    return config;
  } catch {
    return null;
  }
}

/** Save Google Drive configuration */
export function saveGoogleDriveConfig(config: GoogleDriveConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify(config));
}

/** Clear Google Drive connection */
export function disconnectGoogleDrive(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DRIVE_CONFIG_KEY);
}

/** Check if Google Drive is currently connected and authenticated */
export function isGoogleDriveConnected(): boolean {
  const config = getGoogleDriveConfig();
  if (!config || !config.accessToken) return false;
  // If token has expired, consider not connected until refreshed
  if (config.tokenExpiresAt && Date.now() > config.tokenExpiresAt) {
    return false;
  }
  return true;
}

/**
 * Find or automatically create the "BaithakOS Backups" folder in Google Drive
 */
export async function getOrCreateDriveFolder(accessToken: string): Promise<string> {
  // 1. Search for existing folder
  const query = encodeURIComponent(`name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Google Drive API error: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Automatically create the environment folder if it does not exist
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Automated backup environment created by BaithakOS',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create BaithakOS folder in Google Drive: ${createRes.statusText}`);
  }

  const createdData = await createRes.json();
  return createdData.id;
}

/**
 * Upload or update the shop backup file in the Google Drive folder.
 */
export async function syncToGoogleDrive(
  shopId: UUID,
  silent = false
): Promise<{ success: boolean; message: string }> {
  // If device is offline, pause silently without disturbing the user
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, message: 'Paused (device is offline)' };
  }

  const config = getGoogleDriveConfig();
  if (!config || !config.accessToken) {
    return { success: false, message: 'Google Drive is not connected yet' };
  }

  try {
    // 1. Generate complete offline shop snapshot
    const backup: ShopBackupData = await exportShopBackup(shopId);
    const fileName = `${DRIVE_FILE_PREFIX}${shopId}.json`;

    // 2. Ensure folder exists in Drive
    let folderId = config.folderId;
    if (!folderId) {
      folderId = await getOrCreateDriveFolder(config.accessToken);
      config.folderId = folderId;
      saveGoogleDriveConfig(config);
    }

    // 3. Check if backup file already exists in the folder
    const fileQuery = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
    const fileSearchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQuery}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });

    const fileSearchData = await fileSearchRes.json();
    const existingFile = fileSearchData.files && fileSearchData.files.length > 0 ? fileSearchData.files[0] : null;

    const fileContent = JSON.stringify(backup, null, 2);

    if (existingFile) {
      // 4a. Update existing file content
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: fileContent,
        }
      );

      if (!updateRes.ok) {
        throw new Error(`Failed to update Drive file: ${updateRes.statusText}`);
      }
    } else {
      // 4b. Create new file with multipart upload (metadata + content)
      const metadata = {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
        description: `BaithakOS Backup for ${backup.metadata.shopName}`,
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        fileContent +
        closeDelim;

      const createRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!createRes.ok) {
        throw new Error(`Failed to create Drive file: ${createRes.statusText}`);
      }
    }

    const lastSyncTime = Date.now();
    localStorage.setItem('baithak_drive_last_sync', String(lastSyncTime));

    return {
      success: true,
      message: `✓ Saved to Google Drive in folder "${DRIVE_FOLDER_NAME}" (${backup.metadata.totalProducts} products, ${backup.metadata.totalSales} sales)`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Google Drive sync failed';
    if (!silent) {
      console.warn('Google Drive sync:', errorMsg);
    }
    return { success: false, message: errorMsg };
  }
}

/**
 * Fetch and restore the latest backup from the user's Google Drive
 */
export async function restoreFromGoogleDrive(shopId: UUID): Promise<{ success: boolean; message: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, message: 'Device is offline. Please connect to internet to restore from Google Drive.' };
  }

  const config = getGoogleDriveConfig();
  if (!config || !config.accessToken) {
    return { success: false, message: 'Google Drive is not connected yet.' };
  }

  try {
    let folderId = config.folderId;
    if (!folderId) {
      folderId = await getOrCreateDriveFolder(config.accessToken);
    }

    const fileName = `${DRIVE_FILE_PREFIX}${shopId}.json`;
    const query = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });

    const searchData = await searchRes.json();
    let fileId: string | null = null;
    let modifiedTime: string | null = null;

    if (searchData.files && searchData.files.length > 0) {
      fileId = searchData.files[0].id;
      modifiedTime = searchData.files[0].modifiedTime;
    } else {
      // If not found by shopId, try finding any baithak backup file in the folder
      const anyQuery = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const anySearchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${anyQuery}&fields=files(id,name,modifiedTime)`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      const anyData = await anySearchRes.json();
      if (anyData.files && anyData.files.length > 0) {
        fileId = anyData.files[0].id;
        modifiedTime = anyData.files[0].modifiedTime;
      }
    }

    if (!fileId) {
      return { success: false, message: 'No backup file found in your Google Drive folder.' };
    }

    // Download content
    const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });

    if (!downloadRes.ok) {
      throw new Error(`Failed to download backup: ${downloadRes.statusText}`);
    }

    const backupData: ShopBackupData = await downloadRes.json();
    await restoreShopBackup(backupData);

    return {
      success: true,
      message: `✓ Successfully restored from Google Drive (${modifiedTime ? new Date(modifiedTime).toLocaleString() : 'Latest'})!`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Restore from Google Drive failed',
    };
  }
}

/**
 * 5-Minute Auto-Sync Manager
 *
 * Runs silently in the background:
 * - Syncs every 5 minutes if online and connected to Drive.
 * - Pauses silently if offline.
 * - Never shows blocking alerts to the shopkeeper.
 */
class GoogleDriveAutoSyncManager {
  private timer: NodeJS.Timeout | null = null;
  private currentShopId: UUID | null = null;
  private isSyncing = false;

  start(shopId: UUID): void {
    if (this.currentShopId === shopId && this.timer) return;
    this.stop();
    this.currentShopId = shopId;

    // Run every 5 minutes (300,000 ms)
    this.timer = setInterval(() => {
      this.tick();
    }, 5 * 60 * 1000);

    // Also register online event listener to resume immediately when back online
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
    this.currentShopId = null;
  }

  private handleOnline = () => {
    // When internet connection is restored, silently perform sync
    this.tick();
  };

  private async tick(): Promise<void> {
    if (!this.currentShopId || this.isSyncing) return;
    if (!isGoogleDriveConnected()) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return; // Silent pause when offline

    this.isSyncing = true;
    try {
      await syncToGoogleDrive(this.currentShopId, true);
    } catch {
      // Silently catch so shopkeeper is never disturbed
    } finally {
      this.isSyncing = false;
    }
  }
}

export const googleDriveAutoSync = new GoogleDriveAutoSyncManager();
