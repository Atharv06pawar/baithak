/**
 * BaithakOS — Supabase Free Cloud Integration
 *
 * Provides free cloud backup, single account authentication,
 * and online sync to complement offline-first IndexedDB storage.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { exportShopBackup, restoreShopBackup, type ShopBackupData } from '@/lib/backup';
import { getDB } from '@/lib/db';
import type { UUID } from '@/lib/types';

const CLOUD_CONFIG_KEY = 'baithak_supabase_config';

const DEFAULT_SUPABASE_URL = 'https://mpgznsjtehbepfifvmgw.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZ3puc2p0ZWhiZXBmaWZ2bWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0ODk3ODgsImV4cCI6MjEwNjA2NTc4OH0.YZ9c0xtq-S3KqZyJGcuSzOYIA3ZGg1pHC4KnyKdNTcQ';

export interface CloudCredentials {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Retrieve configured Supabase credentials (from env, localStorage, or project defaults) */
export function getCloudCredentials(): CloudCredentials {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return { supabaseUrl: envUrl, supabaseAnonKey: envKey };
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.supabaseUrl && parsed.supabaseAnonKey) return parsed;
      } catch {
        // fallback
      }
    }
  }

  return { supabaseUrl: DEFAULT_SUPABASE_URL, supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY };
}

/** Save custom Supabase credentials in local storage */
export function saveCloudCredentials(creds: CloudCredentials): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(creds));
  }
}

/** Get Supabase client singleton */
let cachedClient: SupabaseClient | null = null;
let lastCredsHash = '';

export function getSupabaseClient(): SupabaseClient | null {
  const creds = getCloudCredentials();
  if (!creds || !creds.supabaseUrl || !creds.supabaseAnonKey) {
    return null;
  }

  const hash = `${creds.supabaseUrl}:${creds.supabaseAnonKey}`;
  if (cachedClient && lastCredsHash === hash) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(creds.supabaseUrl, creds.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    lastCredsHash = hash;
    return cachedClient;
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
}

/** Check if cloud database is configured */
export function isCloudConfigured(): boolean {
  return getCloudCredentials() !== null;
}

/** Test Supabase connection */
export async function testCloudConnection(): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase credentials are not configured yet.',
    };
  }

  try {
    // Try to query or ping
    const { error } = await client.from('shop_backups').select('id').limit(1);
    if (error && error.code !== 'PGRST116' && !error.message.includes('relation "public.shop_backups" does not exist')) {
      return { success: false, message: error.message };
    }
    return { success: true, message: '✓ Successfully connected to Supabase Cloud!' };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

/**
 * Push entire local offline shop state to Supabase online DB.
 * Uses the `shop_backups` table in Supabase.
 */
export async function cloudSyncPush(shopId: UUID): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Cloud DB not configured. Enter Supabase URL & Anon Key in Settings.',
    };
  }

  try {
    // 1. Generate full offline snapshot
    const backup: ShopBackupData = await exportShopBackup(shopId);

    // Attach email if available in shop or drive config
    let email = backup.metadata.ownerEmail;
    if (!email && typeof window !== 'undefined') {
      try {
        const drive = localStorage.getItem('baithak_google_drive_config');
        if (drive) {
          const parsed = JSON.parse(drive);
          if (parsed.userEmail) email = parsed.userEmail;
        }
      } catch {
        // ignore
      }
    }

    const payload = {
      ...backup,
      ownerEmail: email || null,
      metadata: {
        ...backup.metadata,
        ownerEmail: email || undefined,
      },
    };

    // 2. Upsert into Supabase shop_backups table
    const record = {
      shop_id: shopId,
      shop_name: backup.metadata.shopName,
      owner_name: backup.metadata.ownerName,
      total_products: backup.metadata.totalProducts,
      total_sales: backup.metadata.totalSales,
      backup_payload: payload,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('shop_backups')
      .upsert(record, { onConflict: 'shop_id' });

    if (error) {
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        return {
          success: false,
          message: 'Supabase RLS is blocking writes. Please run: ALTER TABLE shop_backups DISABLE ROW LEVEL SECURITY; in Supabase SQL Editor.',
        };
      }
      if (error.message?.includes('relation "public.shop_backups" does not exist')) {
        return {
          success: false,
          message: 'Supabase table "shop_backups" does not exist. Run: CREATE TABLE shop_backups (shop_id text PRIMARY KEY, shop_name text, owner_name text, total_products int, total_sales int, backup_payload jsonb, updated_at timestamptz);',
        };
      }
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `✓ Cloud DB updated (${backup.metadata.totalProducts} products, ${backup.metadata.totalSales} sales backed up)`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Cloud backup failed',
    };
  }
}

/**
 * Fetch the latest backup snapshot from Supabase and restore it into local IndexedDB.
 */
export async function cloudSyncPull(shopId: UUID): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Cloud DB not configured. Enter Supabase URL & Anon Key in Settings.',
    };
  }

  try {
    const { data, error } = await client
      .from('shop_backups')
      .select('backup_payload, updated_at')
      .eq('shop_id', shopId)
      .maybeSingle();

    if (error) {
      return { success: false, message: error.message };
    }

    if (!data || !data.backup_payload) {
      // If not found by exact shop_id, try fetching the latest backup in the project
      const { data: latestAny, error: anyErr } = await client
        .from('shop_backups')
        .select('backup_payload, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyErr || !latestAny || !latestAny.backup_payload) {
        return {
          success: false,
          message: 'No cloud backup found in Supabase for this shop.',
        };
      }

      await restoreShopBackup(latestAny.backup_payload as ShopBackupData);
      return {
        success: true,
        message: `✓ Restored from latest cloud snapshot (${new Date(latestAny.updated_at).toLocaleString()})`,
      };
    }

    // Restore local database
    await restoreShopBackup(data.backup_payload as ShopBackupData);

    return {
      success: true,
      message: `✓ Restored from cloud backup (${new Date(data.updated_at).toLocaleString()})`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Restore from cloud failed',
    };
  }
}

/**
 * Find an existing shop in Supabase by Shop ID, Shop Name, or Mobile Phone,
 * and restore its entire catalog and balances to this device.
 */
export async function findAndRestoreShop(query: {
  shopId?: string;
  shopName?: string;
  phone?: string;
  email?: string;
}): Promise<{ success: boolean; message: string; shopId?: UUID; shopName?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Cloud DB client not configured.' };
  }

  try {
    let q = client.from('shop_backups').select('shop_id, shop_name, owner_name, backup_payload, updated_at');

    if (query.shopId?.trim()) {
      q = q.eq('shop_id', query.shopId.trim());
    } else if (query.shopName?.trim()) {
      q = q.ilike('shop_name', `%${query.shopName.trim()}%`);
    }

    const { data, error } = await q.order('updated_at', { ascending: false }).limit(20);
    if (error) {
      return { success: false, message: error.message };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        message: 'No matching shop found on Baithak Cloud.',
      };
    }

    let match = data[0];

    // Priority 1: Match Google Email if provided
    if (query.email?.trim()) {
      const targetEmail = query.email.trim().toLowerCase();
      const foundWithEmail = data.find((row) => {
        const payload = row.backup_payload as any;
        const pEmail = payload?.ownerEmail?.toLowerCase();
        const mEmail = payload?.metadata?.ownerEmail?.toLowerCase();
        const sEmail = (payload?.tables?.shops?.[0] as any)?.ownerEmail?.toLowerCase();
        return pEmail === targetEmail || mEmail === targetEmail || sEmail === targetEmail;
      });

      if (foundWithEmail) {
        match = foundWithEmail;
      } else if (!query.shopId && !query.shopName && !query.phone) {
        // If user specifically asked to link by email and no shop exists
        return {
          success: false,
          message: `No existing shop linked to ${query.email}. You can create your shop in seconds!`,
        };
      }
    }

    // Priority 2: Match phone if provided
    if (query.phone?.trim()) {
      const cleanTarget = query.phone.replace(/\D/g, '');
      const foundWithPhone = data.find((row) => {
        const payload = row.backup_payload as ShopBackupData;
        const shopObj = payload?.tables?.shops?.[0] as { phone?: string } | undefined;
        if (!shopObj?.phone) return false;
        return shopObj.phone.replace(/\D/g, '').includes(cleanTarget);
      });
      if (foundWithPhone) {
        match = foundWithPhone;
      }
    }

    if (!match.backup_payload) {
      return { success: false, message: 'Shop backup data is empty.' };
    }

    await restoreShopBackup(match.backup_payload as ShopBackupData);

    // If email was provided, persist ownerEmail to local shop
    if (query.email?.trim() && match.shop_id) {
      try {
        const db = getDB();
        await db.shops.update(match.shop_id, { ownerEmail: query.email.trim() });
      } catch {
        // non-blocking
      }
    }

    return {
      success: true,
      shopId: match.shop_id as UUID,
      shopName: match.shop_name,
      message: `✓ Connected to ${match.shop_name}! Synced with cloud data.`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to connect to shop',
    };
  }
}

/**
 * Autonomous Background Multi-Device Sync Manager for Supabase.
 * Automatically pushes new sales/events and keeps devices in sync.
 */
class SupabaseAutoSync {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  public start(shopId: UUID, intervalMs = 25000): void {
    this.stop();
    // Silent initial push
    if (typeof window !== 'undefined' && navigator.onLine) {
      cloudSyncPush(shopId).catch(() => {});
    }

    this.timer = setInterval(async () => {
      if (this.isRunning || typeof window === 'undefined' || !navigator.onLine) return;
      this.isRunning = true;
      try {
        await cloudSyncPush(shopId);
      } catch {
        // non-blocking
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const supabaseAutoSync = new SupabaseAutoSync();
