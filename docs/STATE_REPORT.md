# Swiftbuck application state report

**Updated:** 12 October 2026  
**Scope:** Current repository changes and read-only checks performed during this review.  
**Evidence labels:** `Verified` means a command or read-only database query ran; `Code review` means the claim comes from source inspection; `Unknown` means this workspace did not establish it.

## Current state

Swiftbuck is a wallet and bill-payment application. The Next.js frontend provides signup/login, wallet balance, deposits, transfers, withdrawals, activity, airtime, and data purchases. The Express/TypeScript API manages sessions, wallet operations, ledger entries, payment-provider callbacks, and the VTpass bill catalog and purchases. Postgres stores users, accounts, transactions, ledger entries, payment intents, withdrawals, and bill purchases.

The latest code changes add a database lease to coordinate the reconciliation worker across app instances; recovery checks for pending bills, deposits, and withdrawals; read-only ledger integrity checks; periodic VTpass float comparison; CSRF origin/content-type checks for browser mutations; bounded webhook parsers; production provider-key guards; and server-side resolution of withdrawal account names. VTpass sandbox is now allowed in production deployments for integration testing, and startup logs which endpoint is selected. VTpass's sandbox/live endpoint is selected by `VTPASS_BASE_URL` (default sandbox); changing credentials alone does not switch endpoints. The frontend request helper preserves the 30-second timeout when callers supply an abort signal. Bank listing has a per-user rate limit. Custom rate-limit keys use the express-rate-limit IPv6 helper; the backing store remains in-memory.

These changes are in the local working tree. No deployment or live provider transaction was performed.

## Verification performed

| Check | Result |
|---|---|
| Backend unit tests | **Verified:** 35 tests passed across 4 files. |
| Backend TypeScript | **Verified:** `npx tsc --noEmit` passed. |
| Frontend lint | **Verified:** `npm run lint` passed. |
| Frontend production build | **Verified:** `npm run build` passed; 12 static routes generated. |
| Patch whitespace | **Verified:** `git diff --check` passed. |
| Additive database schema | **Verified:** read-only introspection found `public.JobLease` on the configured database. |
| Provider calls / money movement | **Not run:** no Paystack or VTpass requests, purchases, deposits, withdrawals, or top-ups were made. |

The migration `Backend/migrations/20261012_reconciliation_and_float.sql` creates `JobLease` and adds indexes for reconciliation and purchase lookups. It is additive: it does not drop schema objects or rewrite existing rows. The `JobLease` table presence was checked; this check does not prove that every migration or schema change is present on Render's database.

## Read-only database audit

The configured database branch was queried inside read-only transactions. Aggregate results:

| Check | Result |
|---|---:|
| Unbalanced ledger transactions | 0 |
| Ledger total | 0 kobo |
| Wallets with negative ledger balance | 0 |
| Transactions without ledger entries | 0 |
| Open bill reservations | 0 |
| Delivered bills missing settlement entries | 0 |
| Failed/reversed bills missing reversal entries | 0 |
| Pending withdrawals | 0 |
| Completed deposit transactions without a matching successful payment intent | **2** |

The two unmatched deposits are a reconciliation exception, not proof of fraud, loss, or a current exploit. Their origin is **unknown**: they could be legacy records or deposits created by an earlier test/API flow. The audit deliberately did not output transaction references, account IDs, or user information, so it cannot identify which explanation applies. Review each record's reference, timestamp, balanced ledger entries, and corresponding test/provider logs in Neon before deciding how to classify it. Do not delete or edit ledger rows just to silence the alert.

There were 8 delivered and 9 reversed bill records; no bill was left reserved or processing. System-account aggregates and fee snapshots were also checked; the deposit-intent exception above remains the known integrity alert. This was an aggregate audit, not a full accounting reconciliation or provider statement match.

## Important implementation behavior

- **Bills:** Purchases reserve wallet funds transactionally. Final provider success settles against `SYSTEM_VTPASS_FLOAT`; final failure/reversal refunds the wallet. Unknown provider outcomes remain pending for a later requery. The worker now only targets recoverable states and uses a DB lease to avoid concurrent workers.
- **Deposits:** A signed Paystack success event credits only an existing intent with matching amount and currency. If the event omits its provider fee, the code attempts Paystack verification and records an alert if the fee is still unknown. Late success can complete an expired intent.
- **Withdrawals:** The browser supplies bank code and account number; the backend resolves and stores the account name. The worker verifies pending transfers by reference and settles only recognized terminal outcomes.
- **CSRF and webhooks:** Mutating browser requests require the configured frontend origin (or matching referer) and JSON content type. Webhook paths are exempt from this browser-origin check and use their provider-specific validation. Paystack webhook parsing allows up to 100 KB; the general webhook parser remains 10 KB.
- **Provider configuration:** Startup requires canonical `VTPASS_API_KEY`, `VTPASS_PUBLIC_KEY`, and `VTPASS_SECRET_KEY`. Legacy `VTU_PASS_*` aliases are no longer read. VTpass uses `VTPASS_BASE_URL` if configured and otherwise defaults to sandbox, including in production. For live VTpass, configure the live URL (`https://vtpass.com`) as well as live keys. A Paystack test secret key logs a warning in production and keeps Paystack in test mode.
- **Float top-up tooling:** A manual ledger top-up script exists, but it was not run. Validate its accounting source/reference and review the provider's balance before using it.

## Risks and work remaining

1. **Identify the two unmatched deposits.** Their references and provenance need a careful manual review. The worker will continue emitting an integrity alert while they remain unmatched.
2. **Confirm Render configuration.** This review did not inspect deployment variables. Render must use the canonical `VTPASS_*` names, the intended database branch, and the expected frontend origin. Before VTpass go-live, change both the keys and `VTPASS_BASE_URL` to the live endpoint.
3. **Deploy schema before worker code.** Apply the additive migration to the intended deployment database before starting a version that runs the reconciliation worker. The local database `JobLease` presence does not prove Render has it.
4. **Add provider-mocked integration and browser tests.** Current verification covers unit tests, types, lint, and build, not end-to-end money flows or provider callback/recovery behavior against a disposable database.
5. **Review alert operations.** The worker writes structured events to application logs. Render alert routing, dashboards, backup/restore drills, and an owner for unresolved transactions remain unverified.
6. **Use shared rate-limit storage if scaling.** Current express rate limits use the default in-memory store and do not coordinate across multiple replicas.
7. **VTpass webhook authentication.** The VTpass webhook route does not authenticate the incoming notification; it triggers a provider requery, which remains the source of truth. Confirm VTpass recommended ingress/authentication controls and add them if available.
8. **Production readiness remains unproven.** No live provider transaction, independent accounting sign-off, legal/compliance review, or restore drill was performed.

## Safe next checks

1. In Neon, inspect the two unmatched deposit transactions individually and correlate their references and timestamps with known API tests and provider records. Keep credentials and personal data out of shared logs or chat.
2. In Render, verify environment variable *names* and non-secret configuration values without exposing key contents; confirm the live provider URL and database branch.
3. Apply/verify the additive migration on the deployment branch, then deploy the reconciliation worker.
4. Observe worker logs for one cycle and resolve existing integrity alerts through documented accounting procedures, not direct ledger edits.

This report describes the repository and database branch checked on 12 October 2026. Deployment state may differ.

