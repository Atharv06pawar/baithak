/**
 * BaithakOS — Sync Outbox
 *
 * Every domain mutation calls appendToOutbox() within the same
 * Dexie transaction as the business write.
 *
 * The sync engine drains this table when online.
 */

import type { BaithakDB } from '@/lib/db';
import type { SyncOutboxEvent, UUID } from '@/lib/types';
import { getDeviceId } from '@/lib/device';

interface OutboxAppendOptions {
  db: BaithakDB;
  shopId: UUID;
  entityType: string;
  entityId: UUID;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
}

/**
 * Append a sync event to the outbox.
 * MUST be called inside the same Dexie transaction as the business write.
 */
export async function appendToOutbox(opts: OutboxAppendOptions): Promise<void> {
  const event: SyncOutboxEvent = {
    id: crypto.randomUUID(),
    shopId: opts.shopId,
    deviceId: getDeviceId(),
    entityType: opts.entityType,
    entityId: opts.entityId,
    operation: opts.operation,
    timestamp: Date.now(),
    payload: opts.payload,
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
  };
  await opts.db.sync_outbox.add(event);
}
