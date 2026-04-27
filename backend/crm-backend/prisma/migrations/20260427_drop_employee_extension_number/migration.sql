-- Drop the vestigial Employee.extensionNumber column (April 2026).
--
-- Background:
--   - This column predated the pool model.
--   - It was a free-text "phone extension I can dial them on" memo, never
--     wired to the SIP pipeline. The actual telephony link goes through
--     `TelephonyExtension.crmUserId` → `User.id`. Verified across the
--     codebase: zero references to `Employee.extensionNumber` from any
--     SIP / queue / call-routing path.
--   - Display sites in the admin UI showed "Ext: 123" with `tel:` quick-dial
--     links, but the value was admin-typed and never consistent with the
--     real linked TelephonyExtension. Removing it eliminates a confusing
--     dual-source-of-truth for "what extension is this employee on".
--
-- Future "current linked extension" display, if ever wanted, comes from:
--   SELECT extension FROM "TelephonyExtension" WHERE "crmUserId" = u.id
--   (joined via Employee.userId)

ALTER TABLE "Employee" DROP COLUMN IF EXISTS "extensionNumber";
