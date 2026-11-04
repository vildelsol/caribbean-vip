# Personal data breach runbook (DRAFT for counsel)

A breach is any loss, leak, theft, wrong disclosure or unauthorised change of guest or vendor
personal data, by us or by an outside tool that holds it. Not legal advice. **[COUNSEL]** confirms
the duties, the clocks and who must be told. **[UNKNOWN]** marks facts Ro must fill in.

**The clock: 72 hours.** It starts when we become aware, not when the breach happened. Barbados
asks for notice within 72 hours where feasible (s.63). Cayman's deadline is unconfirmed (commonly
5 days). Jamaica was not researched **[VERIFY]**. We work to 72 hours everywhere
(`jurisdictions.md`). A late notice needs a written reason; no notice needs a written decision.

## Roles
| role | who |
|---|---|
| Incident lead: decides, signs the record | Ro **[UNKNOWN: deputy if Ro is out of reach]** |
| Legal counsel | **[UNKNOWN: name and phone]** |
| Privacy contact shown to guests | **[UNKNOWN: privacy email]** |

## 1. Detect and write down the time
Sources: a guest or vendor report, a processor's alert, a Supabase, Stripe or Vercel alert, odd
rows in `audit_logs` (`action like 'retention.%'` shows purge runs; a gap there is itself a sign),
a leaked key found in a repo or log.

Write down the moment of awareness and who became aware. That time starts the clock. Open a record
from `breach-register.md` at once, before anything else.

## 2. Contain (first hour)
Stop the loss first; investigate after. Pick what fits.

| what leaked or is at risk | do this | side effect to expect |
|---|---|---|
| Supabase service-role key | Rotate in the dashboard; redeploy every function (`scripts/deploy-functions.sh <ref>`); update `SUPABASE_SERVICE_ROLE_KEY` wherever it is stored | All functions fail until redeployed |
| `STRIPE_SECRET_KEY` | Roll the key in Stripe; set the new secret in Supabase | Checkout and refunds stop until set |
| `STRIPE_WEBHOOK_SECRET` | Roll the endpoint secret in Stripe; set the new secret | Webhooks fail until set; Stripe retries |
| `VOUCHER_HMAC_SECRET` | Rotate only after counsel and Ro agree | **Every issued voucher stops validating**; reissue is needed |
| `APP_URL` or `SUPABASE_URL` | Not secrets; check they were not changed by the intruder | |
| A guest's or staff session | Sign the user out everywhere in Supabase Auth | They must sign in again |
| A vendor or admin account | Disable the account; review its `audit_logs` rows | |
| A bad function or page | Remove it from deploy (`supabase functions delete NAME`) or revert the merge | Feature is down |
| A database role or policy hole | Fix by migration; prove with a test run as that role, never as service role | |

Do not delete evidence. Do not run `erase_my_data()` or any purge to "clean up": that destroys the
trail and may erase the people who must be told.

## 3. Assess (hours 1 to 24)
Answer each question in the record. Say "unknown" where it is.
1. **What data?** Use `docs/data-inventory.md`: which tables, which columns. Card numbers are never
   held by us; if Stripe was the source, say so.
2. **Whose?** Guests, vendors, staff. How many. Which island each belongs to (decides the regulator).
3. **How?** Cause, and whether it is still open.
4. **Was it readable?** Hashed or encrypted data with no key leaked is lower risk than plain.
5. **Harm?** Could someone be defrauded, stalked, embarrassed or locked out? Location history
   (geofence impressions, offer claims) and bookings are the sensitive part.
6. **Which tool?** If an outside tool held it, find its row in `processor-record.md` and contact
   it: Supabase, Stripe, Vercel, the email sender (when chosen), every processor listed there.

Evidence to keep, read-only: Supabase logs and Auth logs, function logs, Stripe dashboard events,
Vercel logs, `audit_logs` export, the leaked artefact itself. Save them outside the database.

## 4. Decide whether to notify (by hour 48)
- **Regulator:** notify unless the breach is unlikely to risk people's rights and freedoms. If
  unsure, notify. The incident lead decides with counsel and writes the reason either way.
- **Guests:** notify when the risk to them is high, without undue delay, in plain words.
- **Vendors:** notify those whose data or customers are involved (`vendor-data-clause.md` section 7
  makes them tell us; the reverse is our duty to them).

## 5. Notify (before hour 72)
| who | how | what to include |
|---|---|---|
| Barbados Data Protection Commissioner | **[UNKNOWN: form or email, confirm with counsel]** | nature of the breach, categories and rough numbers of people and records, contact point, likely effects, what we did and will do |
| Cayman Ombudsman | the Ombudsman's breach form **[UNKNOWN: confirm]** | same list |
| Jamaica Information Commissioner | **[VERIFY]** not researched | same list |
| Affected guests | email from the privacy contact; in-app notice if no email | what happened, what data, what we did, what they should do (for example watch for phishing; Stripe card numbers were not held by us), who to contact |

If something is not yet known at hour 72, send what is known and say when the rest will follow.
Do not wait for a full picture.

## 6. Recover and learn
1. Close the hole by a migration or code change, with a test that fails without the fix
   (`prove-a-guard-by-deleting-it`).
2. If a restore is needed, follow `backup-restore-runbook.md` so erased people are not brought back.
3. Update `data-inventory.md` and this runbook if the breach showed a gap.
4. Close the record: root cause, people told and when, regulator reference number.

## Processor duty to tell us
Each processor must alert us promptly **[COUNSEL: hours]**. Stripe, Supabase and Vercel do under
their standard terms **[UNKNOWN: confirm each DPA is signed]**. Until confirmed, check each
provider's status and security pages at least weekly while we hold live data.

## Practice
Run this once as a drill before the first real vendor goes live. Time how long steps 1 to 5 take.
If it takes over 72 hours on paper, fix the plan before launch.
