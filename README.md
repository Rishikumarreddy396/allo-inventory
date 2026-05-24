# Allo Inventory

A Next.js inventory and order-fulfillment platform with race-condition-safe reservations for multi-warehouse retail brands.

**Live demo:** https://allo-inventory-theta.vercel.app

---

## Running locally

### Prerequisites
- Node.js 18+
- A [Neon](https://neon.tech) Postgres database
- An [Upstash](https://upstash.com) Redis database

### Setup

1. Clone the repository and install dependencies:
```bash
   git clone https://github.com/your-username/allo-inventory
   cd allo-inventory
   npm install
```

2. Create a `.env.local` file in the root:
```env
   DATABASE_URL="your-neon-connection-string"
   UPSTASH_REDIS_REST_URL="your-upstash-url"
   UPSTASH_REDIS_REST_TOKEN="your-upstash-token"
   RESERVATION_TTL_MINUTES=10
   CRON_SECRET="any-random-string"
   NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Run database migrations:
```bash
   npx prisma migrate dev
```

4. Seed the database:
```bash
   npx prisma db seed
```

5. Start the development server:
```bash
   npm run dev
```

The app will be available at `http://localhost:3000`.

---

## How the reservation system works

When a customer proceeds to checkout, we create a reservation that temporarily holds
the requested units for 10 minutes. During this window, those units are counted as
reserved and unavailable to other shoppers. If payment succeeds, the reservation is
confirmed and stock is permanently decremented. If payment fails or the customer
cancels, the reservation is released and units return to available stock.

### Race condition safety

The core challenge is ensuring that two simultaneous requests for the last unit
result in exactly one success and one 409 — never two successes.

We solve this with a **conditional atomic update** inside a Prisma transaction:

```typescript
const updated = await tx.warehouseStock.updateMany({
  where: {
    productId,
    warehouseId,
    reservedUnits: { lte: stock.totalUnits - units }, // re-check at write time
  },
  data: {
    reservedUnits: { increment: units },
  },
});

if (updated.count === 0) throw new Error("INSUFFICIENT_STOCK");
```

The `WHERE` condition is evaluated atomically at the database level at the moment
of the `UPDATE`. If two requests race, one will satisfy the condition and succeed.
The other will find `updated.count === 0` because the condition no longer holds,
and returns a 409. This approach works reliably with Neon's PgBouncer connection
pooling, unlike `SELECT FOR UPDATE` which requires a persistent connection held
across the transaction.

---

## How expiry works in production

Reservations have an `expiresAt` timestamp set to 10 minutes after creation.
We handle expiry on two layers:

**Layer 1 — Lazy cleanup (primary):**
Every `GET /api/products` call runs `releaseExpiredReservations()` before
computing available stock. This scans for any `PENDING` reservations past their
`expiresAt` and releases them, restoring units to available stock. In practice,
this means expired stock is freed the moment any user loads the product page —
which covers the vast majority of real-world traffic patterns.

**Layer 2 — Cron job (safety net):**
A `/api/cron/expire-reservations` endpoint exists and is protected by a
`CRON_SECRET` header. On Vercel's free Hobby plan, cron jobs are limited to
once daily (`0 0 * * *`). On a paid plan, this would run every minute
(`* * * * *`) for near-real-time cleanup even during low-traffic periods.

This two-layer approach means the system is correct under all traffic conditions
without requiring a persistent background worker.

---

## Idempotency

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints
support idempotency via the `Idempotency-Key` request header.

If a client sends the same key twice (e.g. after a network timeout), the server
returns the original response from Redis without repeating the side effect. Keys
are stored in Upstash Redis with a 24-hour TTL.

```bash
curl -X POST https://your-app.vercel.app/api/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-client-key-123" \
  -d '{"productId": "...", "warehouseId": "...", "units": 1}'
```

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript |
| ORM | Prisma |
| Database | Neon (Postgres) |
| Cache / Idempotency | Upstash Redis |
| Validation | Zod |
| UI | Tailwind CSS + shadcn/ui |
| Hosting | Vercel |

---

## Trade-offs and what I'd do differently

**Conditional update vs SELECT FOR UPDATE:**
The original implementation used `SELECT FOR UPDATE` for row-level locking, which
is the textbook solution. However, Neon's PgBouncer connection pooling doesn't
reliably hold connections across transactions, causing the lock to fail in
production. The conditional `updateMany` approach achieves the same correctness
guarantee by pushing the check into the `WHERE` clause of the `UPDATE` statement,
which Postgres executes atomically. With a direct (non-pooled) database connection
or a self-hosted Postgres, `SELECT FOR UPDATE` would be the cleaner choice.

**No authentication:**
The reservation system has no user authentication. In production, reservations
would be tied to a user session or customer ID to prevent abuse and enable
per-user reservation limits.

**Single unit reservations:**
The UI currently reserves exactly 1 unit at a time. The API supports arbitrary
quantities — a quantity selector on the frontend would be a straightforward
addition.

**Expiry granularity:**
On Vercel's Hobby plan, the cron safety net runs daily rather than every minute.
The lazy cleanup on read compensates for this in practice, but a production system
on a paid plan (or using a separate worker process) would run the cron every
minute.

**No optimistic UI on the product listing:**
After reserving, the product page stock count only updates after a full navigation
back. With React Query or SWR, the count could update instantly on the listing
page without a server round-trip.
