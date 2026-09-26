# BaithakOS — Security Model

---

## 1. Threat Model

BaithakOS handles real financial data for a real business.

Assumed threats:
- An attacker who can inspect browser storage
- An attacker who can manipulate client-side JavaScript
- An attacker who knows the Firebase project ID
- An unauthorized person who gains physical access to the shop device

Not in scope for V1:
- Nation-state attacks
- Server-side infrastructure attacks (Firebase is Google's responsibility)

---

## 2. Authentication

### Provider

Firebase Authentication.

V1 supports:
- Google Sign-In (primary)
- Phone number / OTP (fallback for shop owners without Google accounts)
- Anonymous (session only — no persistence, no sync — for demo/trial only)

### Implementation Rules

- Never store Firebase tokens in `localStorage` (use Firebase SDK's default `indexedDB` persistence)
- Use `onAuthStateChanged` observer — never cache `currentUser` in application state without re-verification
- Sign out clears local shop session but does NOT clear local IndexedDB (intentional — data persists for restore)
- Forced sign-out triggers sync flush before clearing auth state

---

## 3. Shop Isolation

Every database entity includes `shopId`.

### Client-Side Enforcement

All Dexie queries filter by `shopId` from the authenticated session:

```typescript
// src/lib/db/queries/products.ts
export async function getProducts(shopId: string): Promise<Product[]> {
  return db.products.where('shopId').equals(shopId).toArray();
}
```

`shopId` is never taken from URL parameters or user input. It comes from the authenticated user's shop record only.

### Server-Side Enforcement

Firestore Security Rules are the authoritative enforcement layer.

**Never trust the client's claimed `shopId`.**

---

## 4. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: is the user authenticated?
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: does the user own this shop?
    function isShopOwner(shopId) {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/user_shops/$(request.auth.uid)/shops/$(shopId));
    }

    // User's own shop membership index
    match /user_shops/{userId}/shops/{shopId} {
      allow read, write: if request.auth.uid == userId;
    }

    // All shop data
    match /shops/{shopId}/{document=**} {
      allow read, write: if isShopOwner(shopId);
    }

    // Sync events — append-only, cannot overwrite another event
    match /shops/{shopId}/sync_events/{eventId} {
      allow create: if isShopOwner(shopId)
        && request.resource.data.shopId == shopId;
      allow read: if isShopOwner(shopId);
      allow update, delete: if false; // immutable
    }
  }
}
```

---

## 5. Authorization

### Roles (V1)

| Role | Permissions |
|---|---|
| `owner` | Full access to all shop operations |
| `staff` (future) | POS and limited inventory only |

In V1, only the `owner` role exists.

### Enforcement

- Client checks role before rendering sensitive UI
- Firestore rules re-verify at write time (defense in depth)
- Audit logs record who performed every sensitive operation

---

## 6. Input Validation

All domain service inputs validated before database writes:

```typescript
// Example: product creation
function validateProduct(input: unknown): Product {
  if (!input || typeof input !== 'object') throw new ValidationError('Invalid input');
  const p = input as Partial<Product>;
  if (!p.name?.trim()) throw new ValidationError('Product name is required');
  if (typeof p.sellingPrice !== 'number' || p.sellingPrice < 0)
    throw new ValidationError('Invalid selling price');
  // ... etc
  return p as Product;
}
```

Rules:
- All string inputs: trimmed, max-length enforced
- All monetary inputs: must be non-negative integers
- All IDs: validated as UUID format (when received from external sources)
- No SQL injection risk (Dexie / IndexedDB is not SQL)
- Firestore writes validated by security rules server-side

---

## 7. Secrets and API Keys

- Firebase config (API key, project ID) is NOT secret — it is safe to expose in browser
- Firestore security rules are the actual security boundary
- No server-side secrets in client code
- No third-party paid API keys in V1
- Environment variables in `.env.local` (gitignored) for local dev
- Cloudflare Pages environment variables for production

---

## 8. Audit Logging

Every significant mutation writes an `audit_log` entry:

```typescript
interface AuditLog {
  id: string;
  shopId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete' | 'reverse';
  actorId?: string;
  payload: Record<string, unknown>;
  createdAt: number;
}
```

Mutations that require audit logs:
- Sale created / reversed / voided
- Product created / price changed
- Stock adjusted manually
- Expense recorded
- Customer ledger modified
- Daily summary closed
- Backup exported / restored
- User signed in / signed out

---

## 9. Error Handling

- Never expose database errors, Firebase errors, or stack traces to the owner UI
- All domain errors use typed `DomainError` classes with user-safe messages
- Developer diagnostics panel (auth-gated) shows technical errors
- Sentry or equivalent (self-hosted / free tier) for production error tracking — optional V1

---

## 10. Data in Client Logs

- `console.log` must never emit: prices, customer names, phone numbers, financial totals
- Development logging only: use a `logger` utility that suppresses output in production
- No financial data in error messages sent to external services

---

## 11. Physical Device Security

Recommendations to shop owner (not enforced by software):
- Set a screen lock PIN on the device
- Do not share the device with untrusted persons
- Sign out when handing the device to a stranger

BaithakOS should display a reminder if the app has been open for >12 hours without interaction.

---

## 12. Data Ownership

The shop owner owns their data.

BaithakOS must provide:
- Full data export (JSON) at any time
- Option to delete all cloud data
- No data sharing with third parties without explicit consent
- No analytics sent to external services without consent

This is a legal and ethical commitment, not merely a technical feature.
