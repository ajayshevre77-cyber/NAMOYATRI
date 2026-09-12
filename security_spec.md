# Security Specification: Namo Yatri (Simhastha Kumbh 2027)

## 1. Data Invariants
1. **Identity & Role Invariant**:
   - Every document in `/users/{userId}` and `/profiles/{userId}` must strictly match `request.auth.uid == userId`.
   - Normal users cannot set or escalate their own role to `ADMIN` or `OPERATIONS`.
   - Normal users cannot alter their own `verificationStatus` directly to `VERIFIED`.

2. **Official Information Invariant**:
   - Only authorized roles (`ADMIN`, `OPERATIONS` or server-verified administrative authority) can create or update `/announcements` marked with `sourceType == 'AUTHORIZED_OFFICIAL'` or `status == 'PUBLISHED'`.
   - Announcements created by unverified sources must default to `sourceType == 'COMMUNITY'` or `sourceType == 'DEMO'`.

3. **PII & Privacy Invariant**:
   - Phone numbers, email addresses, emergency contacts, and family group memberships are private by default.
   - Blanket reads on `/users`, `/profiles`, `/emergencyContacts`, and `/familyMembers` are strictly forbidden. Users can only query and read their own records or confirmed family groups.

4. **Pass & Financial Invariant**:
   - Transit mobility passes and payment records are immutable once generated.
   - Normal users cannot fabricate pass validation tokens or mark payments as `COMPLETED` on client write.

5. **Audit Log Invariant**:
   - Documents in `/auditLogs` are strictly write-only / append-only for administrative events and cannot be modified or deleted by any client.

---

## 2. The "Dirty Dozen" Adversarial Payloads
The following payloads represent targeted attacks against Identity, Integrity, and State that MUST return `PERMISSION_DENIED`:

1. **Payload 01 (Privilege Escalation)**: User creates a `/users/{uid}` profile with `{ role: 'ADMIN' }`.
2. **Payload 02 (Verification Spoofing)**: Driver updates `/drivers/{driverId}` with `{ verificationStatus: 'VERIFIED' }` without administrative approval.
3. **Payload 03 (PII Leakage Query)**: Unauthenticated or non-owner user attempts `list` on `/emergencyContacts`.
4. **Payload 04 (Pass Counterfeiting)**: User writes directly to `/passes/{passId}` setting `{ status: 'ACTIVE', validUntil: '2030-01-01' }` with arbitrary `userId`.
5. **Payload 05 (Fake Official Announcement)**: Tourist user publishes `/announcements/{id}` with `{ sourceType: 'AUTHORIZED_OFFICIAL', priority: 'high_alert' }`.
6. **Payload 06 (Audit Log Tampering)**: User attempts to `update` or `delete` an existing record in `/auditLogs/{logId}`.
7. **Payload 07 (Ghost Field Injection)**: User updates `/profiles/{uid}` injecting unvalidated fields `{ isAdmin: true, bypassFairCap: true }`.
8. **Payload 08 (Identity Impersonation in SOS)**: User submits `/emergencyCases/{caseId}` with `{ userId: 'DIFFERENT_VICTIM_UID' }`.
9. **Payload 09 (Cross-User Booking Manipulation)**: Driver attempts to cancel or modify a tourist's booking record without authorization.
10. **Payload 10 (Family Circle Snooping)**: Non-member queries `/familyMembers` belonging to another user's `groupId`.
11. **Payload 11 (Denial of Wallet - Jumbo Payload)**: Attacker sends 1MB text payload in announcement comment or user display name.
12. **Payload 12 (Timestamp Backdating)**: Attacker passes fabricated `createdAt: '1970-01-01'` instead of `request.time`.
