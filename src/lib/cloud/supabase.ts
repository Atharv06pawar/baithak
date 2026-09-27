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

export interface CloudCredentials {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Retrieve configured Supabase credentials (from env or localStorage) */
export function getCloudCredentials(): CloudCredentials | null {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return { supabaseUrl: envUrl, supabaseAnonKey: envKey };
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
  }

  return null;
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

    // 2. Upsert into Supabase shop_backups table
    const record = {
      shop_id: shopId,
      shop_name: backup.metadata.shopName,
      owner_name: backup.metadata.ownerName,
      total_products: backup.metadata.totalProducts,
      total_sales: backup.metadata.totalSales,
      backup_payload: backup,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('shop_backups')
      .upsert(record, { onConflict: 'shop_id' });

    if (error) {
      // If table doesn't exist, provide helpful schema creation guidance
      if (error.message.includes('relation "public.shop_backups" does not exist')) {
        return {
          success: false,
          message: 'Supabase table "shop_backups" does not exist. Run the 1-line SQL script in Supabase SQL editor: CREATE TABLE shop_backups (shop_id text PRIMARY KEY, shop_name text, owner_name text, total_products int, total_sales int, backup_payload jsonb, updated_at timestamptz);',
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
