# Security Specification: TutorConnect V2

## Data Invariants
1. **Immutable Roles**: A user's `role` field is fixed upon creation and can only be modified by a `super-admin`.
2. **Author Integrity**: Users can only create documents where the `authorId` (or equivalent like `student_id`, `tutor_id`) strictly matches their `request.auth.uid`.
3. **Financial Isolation**: `wallet_balance` and `admin_ledgers` are strictly protected. Users cannot increment their own balance.
4. **Verified Participation**: Only users with `email_verified == true` can perform write operations (create/update).
5. **Relationship Locking**: Bids must reference a valid `request_id`. Escrow must reference a valid `lesson_id`.
6. **No Phantom Fields**: Every document must strictly match the schema defined in `firebase-blueprint.json`. Additional "shadow" fields will be rejected.
7. **Terminal States**: Once a lesson is `completed` or `refunded`, no further updates to its status are allowed.
8. **Denial of Wallet (DoW) Prevention**: All string fields are limited to logical maximums (e.g., messages < 500 chars, bios < 2000 chars).

---

## The "Dirty Dozen" Payloads (Red Team Test Cases)

### 1. Privilege Escalation (Self-Admin)
**Target:** `/users/{my_uid}`
**Payload:** `{"role": "admin", "full_name": "Attacker"}`
**Expectation:** `PERMISSION_DENIED` (Users cannot set their own role to admin).

### 2. Wallet Injection
**Target:** `/users/{my_uid}`
**Payload:** `{"wallet_balance": 1000000}`
**Expectation:** `PERMISSION_DENIED` (Users cannot modify their own balance).

### 3. Identity Hijacking (Bid Spoofing)
**Target:** `/bids/{new_id}`
**Payload:** `{"tutor_id": "legit_tutor_uid", "amount": 5.0, "request_id": "req_123"}`
**Expectation:** `PERMISSION_DENIED` (Mismatch between `request.auth.uid` and `tutor_id`).

### 4. Backdating Records
**Target:** `/transactions/{new_id}`
**Payload:** `{"created_at": "timestamp_from_2020", "amount": 100, "user_id": "uid"}`
**Expectation:** `PERMISSION_DENIED` (`created_at` must equal `request.time`).

### 5. Shadow Field Injection (The "Winner" Attack)
**Target:** `/bids/{existing_id}`
**Payload:** `{"status": "accepted", "winner": true}`
**Expectation:** `PERMISSION_DENIED` (`winner` is not in the allowed schema/affected keys for this action).

### 6. Resource Poisoning (Denial of Wallet)
**Target:** `/chat_rooms/{id}/messages/{msg_id}`
**Payload:** `{"message_text": "A".repeat(1000000)}`
**Expectation:** `PERMISSION_DENIED` (Size limit exceeded).

### 7. Unauthorized Settlement (Escrow Release)
**Target:** `/escrow_holding/{id}`
**Payload:** `{"status": "RELEASED"}` (Sent by a Tutor)
**Expectation:** `PERMISSION_DENIED` (Status updates on escrow are Admin-only).

### 8. PII Leakage Probe
**Target:** `/users/{another_uid}` (Get request)
**Expectation:** `PERMISSION_DENIED` (Authenticated users cannot 'get' other user profiles directly; they must use secure list queries or public views).

### 9. Orphaned Record Creation
**Target:** `/bids/{id}`
**Payload:** `{"request_id": "non_existent_id", ...}`
**Expectation:** `PERMISSION_DENIED` (`exists()` check on `lesson_requests` fails).

### 10. Verification Bypass
**Target:** `/tutor_profiles/{my_uid}`
**Payload:** `{"is_verified": true}`
**Expectation:** `PERMISSION_DENIED` (`is_verified` is a system-controlled field).

### 11. Email Spoofing
**Target:** `/lesson_requests/{id}`
**Identity:** `request.auth.token.email_verified == false`
**Expectation:** `PERMISSION_DENIED` (Writes require verified email).

### 12. Cross-Relational Update
**Target:** `/lessons/{lesson_id}` (Update by a non-participant)
**Payload:** `{"meeting_link": "evil.com"}`
**Expectation:** `PERMISSION_DENIED` (User is neither the student nor the tutor for this lesson).

---

## Test Execution Guidelines
All tests should be run using the Firebase Emulator Suite. The `firestore.rules.test.ts` file will automate these checks to ensure zero regressions during future updates.
