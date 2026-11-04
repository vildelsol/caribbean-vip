# Privacy drafts for counsel

DRAFTS. Not legal advice and not published. Each states what the system does today, taken from
`docs/data-inventory.md`, the migrations and the code. Anything marked **[COUNSEL]** is a legal
decision this repo cannot make. Anything marked **[UNKNOWN]** is a fact Ro must confirm.

| file | what it is |
|---|---|
| `processor-record.md` | Who handles personal data for us, what, where, under what terms (GDPR Art 28, 30) |
| `dpia.md` | Data protection impact assessment for geofenced offers (GDPR Art 35) |
| `privacy-notice.md` | Plain-language notice for guests (GDPR Art 13) |
| `jurisdictions.md` | Barbados and Cayman requirements, from quick research (verify with counsel) |
| `integrations.md` | How any outside tool or database plugs in without new privacy plumbing |
| `audit-log-and-erasure.md` | How an append-only audit log and the right to erasure fit together |
| `backup-restore-runbook.md` | Restoring a backup without bringing erased people back |
| `breach-runbook.md` | What to do in the first 72 hours of a personal data breach |
| `breach-register.md` | Log of every breach and near miss |
| `vendor-data-clause.md` | Draft clause for the vendor agreement |

When the system changes, update these in the same PR. The table list in `data-inventory.md` is the
source of truth for what is held; these files must not contradict it.
