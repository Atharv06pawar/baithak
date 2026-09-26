/**
 * BaithakOS — Background Sync Engine
 *
 * Drains the local Dexie sync_outbox when connectivity is available.
 * Fully idempotent and never blocks the user interface.
 */

import { getDB } from '@/lib/db';
import type { SyncOutboxEvent, UUID } from '@/lib/types';

export type SyncStateIndicator = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncEngineStatus {
  state: SyncStateIndicator;
  pendingCount: number;
  lastSyncedAt?: number;
  label: string;
}

export type SyncEventListener = (status: SyncEngineStatus) => void;

class SyncEngine {
  private isRunning = false;
  private isOnline = true;
  private listeners: Set<SyncEventListener> = new Set();
  private pendingCount = 0;
  private lastSyncedAt?: number;
  private syncTimer?: NodeJS.Timeout;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }
  }

  public subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  public getStatus(): SyncEngineStatus {
    let state: SyncStateIndicator = 'synced';
    let label = '✓ All data saved';

    if (!this.isOnline) {
      state = 'offline';
      label = 'Offline — saved locally';
    } else if (this.isRunning) {
      state = 'syncing';
      label = 'Saving to cloud…';
    } else if (this.pendingCount > 0) {
      state = 'syncing';
      label = `${this.pendingCount} pending to sync`;
    }

    return {
      state,
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      label,
    };
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach((l) => l(status));
  }

  private handleNetworkChange(online: boolean) {
    this.isOnline = online;
    this.notify();
    if (online) {
      this.triggerSync();
    }
  }

  /**
   * Drain pending outbox events.
   * Can be passed a cloud transport adapter (e.g. Firebase or HTTP endpoint).
   * By default, marks pending events as synced when online.
   */
  public async triggerSync(
    cloudUploader?: (event: SyncOutboxEvent) => Promise<boolean>
  ): Promise<number> {
    if (this.isRunning || !this.isOnline) return 0;
    this.isRunning = true;
    this.notify();

    let syncedCount = 0;
    try {
      const db = getDB();
      const pendingEvents = await db.sync_outbox
        .where('status')
        .equals('pending')
        .sortBy('createdAt');

      this.pendingCount = pendingEvents.length;
      this.notify();

      for (const event of pendingEvents) {
        if (!this.isOnline) break;

        let success = true;
        if (cloudUploader) {
          try {
            success = await cloudUploader(event);
          } catch {
            success = false;
          }
        }

        if (success) {
          await db.sync_outbox.update(event.id, {
            status: 'synced',
            lastAttempt: Date.now(),
          });
          syncedCount++;
        } else {
          await db.sync_outbox.update(event.id, {
            retryCount: event.retryCount + 1,
            lastAttempt: Date.now(),
          });
        }
      }

      const remaining = await db.sync_outbox
        .where('status')
        .equals('pending')
        .count();

      this.pendingCount = remaining;
      this.lastSyncedAt = Date.now();
    } catch (err) {
      console.warn('Sync engine run error:', err);
    } finally {
      this.isRunning = false;
      this.notify();
    }

    return syncedCount;
  }

  /** Start periodic background poll */
  public start(intervalMs = 15000): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.triggerSync();
    this.syncTimer = setInterval(() => {
      this.triggerSync();
    }, intervalMs);
  }

  public stop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }
}

export const syncEngine = new SyncEngine();
