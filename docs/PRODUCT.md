# BaithakOS — Product Document

> **Make the shop owner's work easier, not the software's interface more impressive.**

---

## 1. What Is BaithakOS?

BaithakOS is a free, offline-first digital operating system for small Indian retail shops.

It begins with one real paan shop and is designed to be trusted with real money, real inventory, and real business decisions.

It is not a demo. It is not a prototype. It is production software for a working shop.

---

## 2. Who Is It For?

**Primary user:** A single paan shop owner, running a small counter-based retail operation.

They:
- sell 30–200 products
- serve 50–500 customers per day
- operate mostly on cash and UPI
- give udhaar (credit) to regular customers
- buy from a small number of local suppliers
- do not use accounting software
- are not technically sophisticated
- cannot afford any software subscription

They need BaithakOS to handle:
- billing (fast, at the counter)
- inventory (automatic, accurate)
- purchases (simple entry)
- udhaar (clear, per customer)
- expenses (quick entry)
- cash (reconciled at day-end)
- reports (simple, useful)
- intelligence (honest, explainable)

---

## 3. Core Product Principle

Every feature must answer at least one of:

1. Does it **save the owner time**?
2. Does it **prevent mistakes**?
3. Does it **prevent loss of money**?
4. Does it help the owner **make a better business decision**?
5. Does it make **the business easier to operate**?

If no, the feature does not ship.

---

## 4. What the Owner Must Never Need to Understand

- Databases or synchronization
- Cloud infrastructure
- Analytics or AI
- APIs or backups
- Technical errors

Complexity lives inside BaithakOS. The interface remains simple.

---

## 5. Cost

**₹0** for the shop owner.

The product is built entirely on free/open-source infrastructure. No paid APIs, no subscriptions, no hidden costs.

---

## 6. Feature Overview (V1 Scope)

| Module | What It Does |
|---|---|
| **POS** | Fast billing — products, quantity, cash/UPI, receipt |
| **Inventory** | Auto-updates on sale/purchase, alerts, history |
| **Purchases** | Record supplier purchase, auto-update stock |
| **Expenses** | Quick expense entry by category |
| **Udhaar** | Per-customer running ledger |
| **Cash Reconciliation** | Day-end cash check with mismatch explanation |
| **Daily Closing** | Summary, confirm, close day |
| **Dashboard** | Today's revenue, alerts, insights |
| **Action Center** | Prioritized, evidence-based alerts |
| **Backup/Restore** | Full export/import, automatic cloud sync |

---

## 7. Explicitly Out of Scope for V1

- Supplier marketplace
- Multi-shop / franchise management
- WhatsApp / social automation
- Advanced ML
- Loyalty programs
- Weather intelligence
- Advertisements
- Financing / lending
- Third-party integrations not required for core function

---

## 8. Definition of Done

A feature is **done** only when:

- ✓ Implemented and typed
- ✓ Linted (zero warnings)
- ✓ Unit tested (logic)
- ✓ Integration tested (flows)
- ✓ Browser tested
- ✓ Mobile tested (touch targets ≥ 44px)
- ✓ Offline tested (if relevant)
- ✓ Failure tested (if relevant)
- ✓ Security reviewed
- ✓ Documented
- ✓ Production build succeeds

---

## 9. Quality Bar

BaithakOS must feel like **a premium product that happens to be free.**

We never knowingly ship:
- Broken calculations
- Unreliable inventory
- Silent data loss
- Fake analytics
- Unsafe synchronization
- Confusing UI
- Fragile cloud dependency

If a feature is not reliable enough, leave it out.
