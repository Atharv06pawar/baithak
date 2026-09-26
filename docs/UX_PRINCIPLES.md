# BaithakOS — UX Principles

---

## 1. Core UX Philosophy

> Make the owner's work easier, not the interface more impressive.

BaithakOS is used at a busy shop counter.
The owner's hands may be busy. Customers are waiting. The phone may be small.

Every design decision must optimize for:
1. Speed of the primary task (completing a sale)
2. Absence of confusion
3. Recovery from mistakes without frustration
4. Trust and calm

---

## 2. Target Devices

Primary: **Android phone** (5–6 inch screen, one-handed use)
Secondary: **Tablet** (counter-mounted, two-handed)
Tertiary: **Desktop browser** (for management tasks)

Design mobile-first. Desktop enhancements come after.

---

## 3. Touch Targets

Minimum touch target: **44 × 44 pixels**

POS product buttons: minimum **60 × 60 pixels**

Never place two tappable elements closer than **8px**.

---

## 4. Typography

| Use | Font size | Weight |
|---|---|---|
| Price in cart | 20px | Bold |
| Product name | 16px | Regular |
| Secondary info | 14px | Regular |
| Captions / labels | 12px | Regular |
| Total amount | 28px | Bold |

Minimum body text: **14px**.

Never use text below 12px for any information that matters.

---

## 5. Color System

```
Primary:   #1a5276  (deep blue — trustworthy)
Success:   #1e8449  (green — sale complete)
Warning:   #d68910  (amber — low stock, mismatch)
Danger:    #c0392b  (red — critical alert)
Neutral:   #2c3e50  (dark — text)
Background:#f8f9fa  (light — calm)
```

Contrast: all text must meet WCAG AA (4.5:1 for normal, 3:1 for large text).

Do not use colors as the only indicator of state. Add icons or labels.

---

## 6. POS Screen Layout

```
┌─────────────────────────────────┐
│  🔍 Search products...          │  ← full-width search
├─────────────────────────────────┤
│ [Meetha] [Sada]  [Masala] [...]│  ← quick buttons (top sellers)
│ [Coke]   [Pepsi] [Water]  [...]│
├────────────────┬────────────────┤
│ CART           │ TOTAL: ₹160    │
│ Meetha × 2 ₹40 │                │
│ Coke × 1   ₹40 │ [CASH] [UPI]  │
│                │                │
│                │ [COMPLETE ✓]  │
└────────────────┴────────────────┘
```

- Cart on left, total + action on right (tablet)
- Single-column on phone: product grid → cart → checkout
- "Complete Sale" button: high contrast, large, bottom of screen on phone

---

## 7. Speed Principles

Target transaction time: **2–5 seconds** for an experienced operator.

To achieve this:
- Products load from local DB (< 50ms)
- Quick-button grid shows top 8–16 products immediately
- Search results appear in < 100ms (local fuzzy search)
- Cart updates are instant (no network calls)
- "Complete Sale" should give success feedback in < 200ms
- Never show a loading spinner for local operations

---

## 8. Confirmation Dialogs

Rule: **Do not ask for confirmation unless data loss or money loss is possible.**

Required confirmations:
- Sale reversal ("Are you sure? This will reverse ₹480.")
- Delete product ("This product has 47 in stock.")
- Clear all data

NOT required:
- Adding a product to cart
- Changing quantity
- Recording an expense
- Viewing reports

---

## 9. Error States

Every error must answer:
1. What happened?
2. What should the owner do now?

❌ Bad: "Error: ECONNRESET"
✅ Good: "Could not save the sale. Your data is safe. Try again."

❌ Bad: "Validation failed: sellingPrice"
✅ Good: "Please enter a valid selling price."

Technical errors go to developer diagnostics only, never to the owner's screen.

---

## 10. Sync Status

Show sync status **subtly**, not alarmingly.

```
✓ All data saved     ← small, green, bottom of screen
Offline — saved locally  ← amber, informational
```

Never:
- Show Firestore error codes
- Show "sync failed" unless it has been failing for > 30 minutes
- Show animated spinners for normal sync activity

---

## 11. Alerts and Notifications

Alerts appear in the **Action Center**, not as modal popups.

The owner checks the Action Center when they choose to.

Exception: Show an inline alert on the POS screen only when:
- A product is out of stock (before completing sale)
- There is a cash mismatch at end of day (before closing)

---

## 12. Navigation

Maximum 2 taps to reach any primary feature from the main screen.

Navigation structure:
```
Bottom nav (phone) / Sidebar (tablet):
  🏠 Today        (dashboard)
  🛒 POS          (billing)
  📦 Inventory    (products + stock)
  📊 Reports      (sales, expenses, udhaar)
  ⚙️  Settings    (products, categories, settings)
```

Deep links within sections use top navigation.

---

## 13. Language and Tone

- Write in plain, simple Hindi-English (Hinglish where natural)
- Prefer "udhaar" over "credit" in the UI
- Prefer "khareedi" or "purchase" over "procurement"
- Prefer "sale" over "transaction" (owners say "sale")
- Avoid: "dashboard", "analytics", "synchronization", "entity", "modal"
- Use: "today's summary", "insights", "saving...", "product", "screen"

Labels must be short. Truncate gracefully. Never let long product names break layout.

---

## 14. Animations

Use animations **only** when they aid understanding:
- Cart item add: brief scale-in (100ms)
- Sale complete: brief success state (green, 300ms)
- Page transitions: slide (200ms)

Never animate:
- Data loading
- Background sync
- Tables or lists
- Charts (avoid chart animations entirely)

---

## 15. Accessibility

- Semantic HTML (`<button>`, `<nav>`, `<main>`, `<section>`)
- All interactive elements keyboard-navigable (Tab/Enter/Space)
- All images have meaningful `alt` text
- Form fields have associated `<label>`
- Error messages linked to inputs via `aria-describedby`
- Color contrast meets WCAG AA minimum

---

## 16. Indian Market Conventions

- Currency: ₹ prefix, two decimal places (₹1,280.00)
- Date format: DD/MM/YYYY (Indian standard)
- Time format: 12-hour with AM/PM
- Numbers: Indian numbering (1,00,000 for one lakh — for large numbers)
- Phone numbers: 10-digit mobile (validate, don't enforce format)
