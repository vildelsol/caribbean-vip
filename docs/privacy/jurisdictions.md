# Barbados and Cayman: what privacy law asks of us (research notes, 2026-11-04)

**Not legal advice.** Quick web research from secondary sources (law-firm guides, vendor
summaries, one news article). Sources conflict in places, and each conflict is marked
**[VERIFY]**. Counsel confirms against the statute, the Gazette and the regulator's guidance before
anything here is relied on. Jamaica (Data Protection Act 2020) was not researched in this pass.

## Barbados: Data Protection Act, 2019
| topic | what the sources say | for us |
|---|---|---|
| In force | 31 March 2021, **except** sections 50, 51, 52, 55, 56, 57 (registration of controllers and processors, and the registers). No later commencement order found. **[VERIFY]** | Treat registration as coming. Ask counsel whether it is in force now. |
| Regulator | A Data Protection Commissioner. One source says appointed from 15 July 2021, a 2023 note says not yet appointed. A Nov 2025 news article says the office is moving from education to enforcement. **[VERIFY]** | Assume it is active. |
| Breach | Notify the Commissioner without delay and, where feasible, within **72 hours** of becoming aware (s.63). Processors must alert the controller. Failure may be an offence. | Runbook: `breach-runbook.md`. Our processors must tell us fast. |
| Consent | Opt-in is described, but no detailed standard was found. A child's consent must come from a parent or guardian, with reasonable efforts to verify. | Our consent records (wording version, time) fit. Confirm the child rule for attendee names. |
| Transfers abroad | The Act restricts them. Our data is in the US (Supabase `us-east-1`, Stripe, Vercel). | Need a lawful basis per processor: contract terms or consent **[COUNSEL]**. |
| Impact assessment | One vendor summary mentions one for high-risk processing; not checked against the statute. **[VERIFY]** | `dpia.md` already covers geofenced offers. |

## Cayman Islands: Data Protection Act, 2017
| topic | what the sources say | for us |
|---|---|---|
| In force | 30 September 2019, with the Data Protection Regulations, 2018. Applies to anyone established in Cayman or processing data there. | Applies once we serve Cayman guests or run there. |
| Regulator | Office of the Ombudsman. | |
| Principles | Eight data protection principles (fair and lawful use, purpose limits, minimisation, accuracy, storage limits, rights, security, transfer). | Our inventory and erasure design map onto these. |
| Privacy notice | Expected as a separate notice. One commentary says a non-resident controller must also name a local representative. **[VERIFY]** | `privacy-notice.md` is separate already. Ask whether a Cayman representative is needed. |
| Breach | Report to the Ombudsman through its form. The deadline is **not confirmed**: one source says 5 days but the page was unreliable. Commonly cited as without undue delay and within 5 days, also telling affected people. **[VERIFY]** | Design the runbook to the stricter clock: **72 hours** covers both. |
| Transfers abroad | Not banned. Allowed when the destination gives adequate protection, by contract, or with consent. | Same US-processor question as Barbados **[COUNSEL]**. |

## What this changes for the build
1. **Breach runbook.** Drafted in `breach-runbook.md`: detect, decide, notify regulator within 72 hours, notify
   guests, record. Needs processor contract terms that oblige them to tell us promptly.
2. **Transfer basis.** One row per processor in `processor-record.md`, with the basis chosen.
3. **Registration and representative.** Ask counsel which registrations and local representatives
   apply to us in each island before launch there.
4. **Children.** Attendee names can be minors; confirm what parental consent means for a parent
   booking for a child.
5. **Pluggable tools.** Every tool that holds guest data must be registered, so a new vendor cannot
   quietly add a transfer or miss an erasure. See `integrations.md`.

## Sources
- DLA Piper, Barbados: https://www.dlapiperdataprotection.com/?c=BB&t=law
- Lex Mundi, Barbados: https://www.lexmundi.com/guides/data-privacy-guide/jurisdictions/caribbean/barbados/
- OneTrust DataGuidance, Barbados: https://www.dataguidance.com/jurisdiction/barbados
- Barbados Today, Nov 2025: https://barbadostoday.bb/?p=459163
- Barbados Government, Data Protection Commission: https://www.gov.bb/Departments/data-protection-commissioner
- Conyers, Cayman breaches: https://www.conyers.com/publications/view/privacy-and-data-breaches-in-the-cayman-islands/
- Mourant, Cayman DPA guide: https://www.mourant.com/file-library/media---2019/2019---guides/the-cayman-islands-data-protection-act--2017.pdf
- Mondaq, Cayman obligations: https://www.mondaq.com/caymanislands/data-protection/852374/cayman-islands-data-protection-law-obligations-for-cayman-islands-businesses
- Deloitte, Cayman DPL: https://www.deloitte.com/cbc/en/services/risk-advisory/services/cayman-dpl-keyareas.html
