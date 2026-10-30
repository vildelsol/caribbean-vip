# Vendor document requirements, per island

**Status: research, as of 2026-10-29. Not legal advice.** Every item below came from a public source
listed at the end. Local counsel in each island must confirm it before it is published to vendors.
The portal's checklist (`packages/types/src/vendorDocuments.ts`) is generated from this document's
conclusions; change them together.

Confidence labels: **Official** (a government page or statute, read directly), **Dated** (official
but old, re-check), **Press** (news report, treat as a lead), **Gap** (could not find).

## Platform standard (all islands)

What we ask of every vendor regardless of island, because it is the strictest common denominator
and because an approved vendor is publicly visible and bookable:

1. Legal entity: certificate of incorporation, or business-name registration for a sole trader.
2. Government photo ID for each owner or director.
3. The tourism licence the island and activity require (below), with number and expiry date.
4. Public liability insurance certificate, with expiry date. Not required by every island's
   licence, but required by us.
5. Tax registration (TRN, BRA clearance, or the island's equivalent).
6. Bank account proof, for payouts.
7. Activity extras (boats, guides, food, vehicles), below.
8. Signed vendor agreement: warrants all licences are held, indemnifies the platform, lets the
   platform suspend at any time. (Drafted by counsel; not in this repo.)

**Policy chosen 2026-10-29: strict.** No vendor is approved without the required items accepted.
Chamber or association membership never blocks approval; it is an optional badge.

## Barbados

| Item | Detail | Confidence |
|---|---|---|
| Tourism licence | Tour operator licence from the Registrar of Travel Services (Ministry of Tourism), under the Travel Services Act, CAP 373A. Valid one year. | Official |
| Documents (first application) | Application form; police certificate of character for each partner; incorporation certificate; bank letter confirming a company account; VAT and income tax clearance (BRA); NIS clearance; US$10,000 security bond. | Official |
| Fees | US$100 first registration, US$50 renewal. | Official, confirm current |
| Renewal | Renewal form, proof security renewed, NIS and BRA clearances, previous year's audited financial statements. | Official |
| Fit and proper | Disqualified: undischarged bankrupts, companies in liquidation, under 18, fraud or corruption conviction in the last 7 years, insufficient resources, insufficient training or experience. | Official (statute) |
| Public list | The Registrar publishes licensed operators each 28 February (Gazette and a daily paper). We can cross-check licence holders against it. | Official |
| Business registration | CAIPO incorporation, then BRA and National Insurance registration. | Official |
| Insurance | The Ministry page lists no insurance requirement. We require it anyway. | Official (absence) |
| Chamber | Barbados Chamber of Commerce and Industry membership is voluntary: proposer and seconder who are members, one-time fee, subscription by headcount. | Official |
| Marine / activity permits | Not researched. | Gap |

**Open question for counsel.** The Act defines "travel service" as passenger transport by air or
sea, "tour operator" as a person principally engaged in developing, planning, promoting and marketing
travel services and accommodation, and "travel agent" as providing travel services to the public on
behalf of providers. A land excursion vendor may not be a "tour operator" under that text, and a
boat or catamaran operator might be. The Ministry nevertheless lists a tour operator licence with
a bond. We need a ruling on which licence, if any, each vendor type needs, and whether the platform
is itself a travel agent (travel agency bond and fee are higher than a tour operator's).

## Jamaica

| Item | Detail | Confidence |
|---|---|---|
| Legal basis | Tourist Board licence, sections 22 and 23A of the Jamaica Tourist Board Act, issued through TPDCo. Reported penalty for operating unlicensed: fine up to J$20,000 or two years. | Official, penalty Press |
| Domestic tour operator | J$10,000 a year; expires 31 March. | Official |
| Attraction | J$10,000 a year or J$30,000 for three years; expires 30 April. Needs an entry fee (otherwise "place of interest", different route). | Official |
| Water sports operator | J$10,000 plus J$800 per employee; expires 30 April. | Official |
| Timing | About one month. The Board meets the third Tuesday each month. All documents need at least four clear weeks of validity at application. | Official |
| Documents, tour operator | Certificate of incorporation; business name registration if different; Companies Office letter of good standing; TRN; list of directors; proof of premises (title or lease); public liability insurance; planning approval; first aid kit and fire extinguishers; NEPA approval where applicable; TPDCo certification and first aid/CPR for each guide, with list; work permits where applicable; fleet list and licensed contract carriers; only JTB-licensed attractions visited. Food: public health certificate and handler permits. Security contract and PSRA certificate where applicable. | Dated (2019 form) |
| Documents, water sports | The company documents above, plus: insurance schedule per location and vessel; fisheries licence; NEPA beach licence per location; permission to operate from each location; per vessel: Maritime Authority of Jamaica safety certificate and certificate of registry; staff list and applications; first aid and CPR (Royal Life Saving Society); coxswain certificate (MAJ); lifeguard or diving certificates where applicable; management plan (maintenance, safety, disaster preparedness, training); jet ski operators: approved launch sites only. | Dated (2019 form) |
| Insurance | Public liability required; no fixed limit, the insurer recommends one; overseas insurers accepted. | Official |
| Travel agency | Separate registration with the Ministry of Tourism under the Travel Agencies Regulation Act (TRN, annual J$2,000, refund and cancellation policy). Defined as arranging travel for people leaving the island by air or sea. | Official |
| New law | A bill to replace the 1955 Tourist Board Act was tabled June 2025 and is said to address online booking platforms. Status unknown. | Press |
| Chamber / JHTA | Not found. | Gap |

**Open question for counsel.** Does a platform that sells in-island excursions need travel agency
registration, and does the 2025 bill (if enacted) change that?

## Cayman Islands

| Item | Detail | Confidence |
|---|---|---|
| Business licence | Trade and Business licence for each location (Trade and Business Licensing Act). Foreign-owned companies also need a licence under the Local Companies (Control) regime. Since 28 April 2026 Caymanian-owned businesses can hold licences of up to five years. | Official (via law-firm summaries) |
| Tour operator licence | No current Department of Tourism tour operator licence found. The Tourism Law (1995 and 2001 revisions) is described as governing accommodation. | Gap |
| Attractions | Governed by the Cayman Islands National Attractions Authority law (2023). | Press |
| Tour vehicles | Traffic Law regulations define "operator" as a Caymanian aged 21 or over, per industry officials. | Press |
| Stingray City, Sandbar | Wildlife Interaction Zone licence from the Department of Environment; a moratorium on new licences was discussed (2023). | Press |
| Port | The Port Authority has a policy for water sports operators soliciting at the port; operator carries adequate insurance. | Dated |
| Insurance | 2018 report: no statutory insurance or qualification requirement for water sports. 2006: an official said every operator should carry liability insurance. We require it. | Press |
| Association | Cayman Islands Tourism Association has member standards on insurance, training and safety. Membership criteria not found. | Press |

**Open questions for the Department of Tourism, in writing.** (1) Does a tour operator or
excursion vendor need any licence besides the Trade and Business licence? (2) Which activities need
a separate permit (boat, water sports, attractions, wildlife zones)? (3) Minimum insurance? (4)
Does a booking platform need registration? Launch Cayman last.

## Platform-level questions for counsel (each island)

1. Is the platform an intermediary or the seller? Who is merchant of record, and what must be
   disclosed to the guest?
2. Does the platform need any travel agency, tour operator or marketplace registration?
3. Consumer protection: refund and cancellation rules, terms the platform must show.
4. Data protection registration and obligations. Barbados Data Protection Act 2019 (registration
   provisions not in force in the source found); Cayman Data Protection Act 2017 (foreign controller
   needs a local representative); Jamaica Data Protection Act 2020 (controllers register with the
   Information Commissioner).
5. Tax the platform may have to collect or report.
6. Retention and handling of vendor identity documents we store.

## What the portal does with this

Each requirement has a key, an island, the business types it applies to, whether it needs a number
and an expiry date, and whether it is required or recommended. Vendors upload against a requirement;
admins accept or reject each document with notes; approval is blocked until every required item for
the vendor's island and business type is accepted and unexpired. Licence numbers can then be
checked against the public lists above.

## Sources

- Barbados: Ministry of Tourism travel services page (tourism.gov.bb/services/travel); Travel
  Services Act CAP 373A (tourism.gov.bb attachments, text read 2026-10-29); Barbados Chamber of Commerce
  membership pages; Invest Barbados and CAIPO registration pages.
- Jamaica: TPDCo licensing FAQ and 2019 pre-requisite forms for domestic tour operator and water
  sports (tpdco.org); Ministry of Tourism travel agency registration; Jamaica Observer and Gleaner
  reports on penalties and the 2025 bill.
- Cayman: ourcayman.ky laws and licensing pages; Maples and Mourant business licensing summaries;
  Cayman Compass reports 2006 to 2023; Port Authority watersports policy.
- Data protection: UWI regional data protection pages; DataGuidance overviews; Mourant guide.
