# Caribbean VIP — MVP Product Requirements Document

**Version 1.0** | Jamaica-first, Caribbean-wide architecture

> One platform. Every island. A locally tailored travel experience powered by verified vendors,
> geofenced discovery, digital vouchers, bookings, and Irie AI.

This file is the transcription of Sections 1–15 of `Caribbean_VIP_MVP_PRD_and_Claude_Build_Prompt.pdf`
and is the product source of truth for the build. Section 16 (the master build prompt) is recorded
separately in [`build-prompt.md`](build-prompt.md).

**Source-of-truth rule:** where any mockup, image or later conversation conflicts with this document,
this document wins. The `ChatGPT Image Aug 2, 2026` mockup is a **colour-scheme reference only** —
its Cayman branding, its 4-tab navigation and its screen inventory are **not** requirements.

---

## Contents

1. [Product vision and positioning](#1-product-vision-and-positioning)
2. [MVP definition and exclusions](#2-mvp-definition-and-exclusions)
3. [Brand and localized island model](#3-brand-and-localized-island-model)
4. [User roles and permissions](#4-user-roles-and-permissions)
5. [Tourist application requirements](#5-tourist-application-requirements)
6. [Vendor portal requirements](#6-vendor-portal-requirements)
7. [Admin console requirements](#7-admin-console-requirements)
8. [Core journeys](#8-core-journeys)
9. [Geofencing, offers, vouchers and QR redemption](#9-geofencing-offers-vouchers-and-qr-redemption)
10. [Payments and booking model](#10-payments-and-booking-model)
11. [Irie AI concierge](#11-irie-ai-concierge)
12. [Data model](#12-data-model)
13. [Architecture and repository structure](#13-architecture-and-repository-structure)
14. [Security, privacy and reliability](#14-security-privacy-and-reliability)
15. [Delivery milestones and acceptance criteria](#15-delivery-milestones-and-acceptance-criteria)

---

## 1. Product Vision and Positioning

Caribbean VIP is a mobile-first regional tourism marketplace and travel companion. It connects
tourists with verified local excursions, attractions, restaurants, transportation providers, and
destination-specific offers at the point of discovery and intent.

### Core positioning

- **Consumer description:** Discover, plan and book the Caribbean like a local.
- **Investor description:** One scalable tourism platform with localized island experiences, shared
  technology, shared accounts, and island-specific supply.
- **Internal product principle:** The app should reduce the distance between tourist intent and local
  vendor revenue.

### Problem being solved

- Tourists struggle to find trusted, locally relevant options beyond generic search results and hotel
  recommendations.
- Local operators often lack affordable, high-intent digital distribution and modern booking tools.
- Tourism spending is concentrated among highly visible operators while authentic smaller vendors
  remain difficult to discover.
- Existing global platforms do not provide a deeply localized, one-app experience across the
  Caribbean.

### MVP success statement

A tourist in Jamaica can discover a verified excursion, receive a geofenced special, book and pay,
access the booking in Trips, display a QR voucher, and have the vendor validate that voucher. A
vendor can onboard, publish an experience, manage bookings, scan vouchers, and view basic
performance. An administrator can verify vendors, moderate listings, oversee bookings, and manage
promotions.

---

## 2. MVP Definition and Exclusions

### MVP includes

- Tourist mobile application for iOS and Android from one codebase.
- Vendor web portal optimized for desktop and mobile browser use.
- Administrative web console.
- Jamaica as the fully populated launch market, with island-aware architecture.
- Authentication, profiles, discovery, search, filters, maps, experience details, booking, Stripe
  payments, Trips, vouchers, QR codes, geofenced offers, notifications, vendor onboarding, and admin
  moderation.
- Irie AI as a grounded concierge that recommends only available platform inventory and clearly
  labels prototype or unverified information.

### Explicitly deferred

- Multi-vendor cart and bundled checkout.
- Dynamic packaging of flights and hotels.
- Complex loyalty points, status tiers, and referral economies.
- Automated cross-border tax calculation beyond recording configured tax and fee fields.
- Tourism board dashboards, white-label deployments, and enterprise APIs.
- Advanced surge pricing, auction-based placements, and machine-learned recommendation ranking.
- Full offline booking and payment processing.

---

## 3. Brand and Localized Island Model

The parent brand is Caribbean VIP. The application is not renamed per island. Instead, the interface
localizes the destination experience after location detection or island selection.

- App-store brand and account: **Caribbean VIP**.
- Localized in-app identity: **VIP Jamaica**, **VIP Cayman**, **VIP Barbados**, and similar
  destination experiences.
- One account, one wallet, one trip history, and one app across every supported island.
- Island localization changes hero imagery, featured vendors, offers, currency display, destination
  content, and recommendations while preserving the same design system and navigation.

**Pitch narrative:** One Platform. Every Island. Locally tailored supply and content on shared
infrastructure.

---

## 4. User Roles and Permissions

| Role | Capabilities | Boundary |
|---|---|---|
| **Tourist / Guest** | Browse public content; use manual location; view experiences; limited saving. | Cannot complete a booking until contact and payment requirements are satisfied. |
| **Tourist / Registered** | Manage profile, saved items, bookings, Trips, vouchers, preferences and Irie AI context. | Can access only own records. |
| **Vendor Owner** | Manage vendor profile, locations, team members, experiences, availability, bookings, promotions, scans and payouts. | Can access only assigned vendor organization. |
| **Vendor Staff** | View operational bookings and scan/validate vouchers. | No access to payout or account ownership settings unless granted. |
| **Platform Admin** | Verify vendors, approve listings, manage islands/categories/offers, review bookings and moderate content. | All actions must be audit logged. |
| **Platform Super Admin** | Manage admins, platform configuration, fee rules, security settings and sensitive operational controls. | Restricted role with strong authentication. |

---

## 5. Tourist Application Requirements

### Primary navigation

- Explore
- Nearby
- **Irie AI** (centre item)
- Trips
- Profile

### Required screens

- Splash and welcome; sign in, register and continue as guest.
- Interest selection and optional travel-party preferences.
- Location permission explanation and manual island/destination selection.
- Explore home with destination-aware sections and search.
- Search results with filters and sort.
- Nearby list/map view with marker previews.
- Experience detail page with media, price, duration, inclusions, pickup information, cancellation
  terms, reviews and availability.
- Date, time, guest and add-on selection.
- Stripe-hosted or Stripe-native payment step using test mode in development.
- Booking confirmation and voucher generation.
- Trips: upcoming, completed, cancelled and saved itinerary items.
- Voucher detail with human-readable booking reference and QR code.
- Profile, preferences, saved items, currency, language, help and notification settings.

### Requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| **T-01** | User can browse Jamaica content without creating an account. | Must | Guest reaches Explore and opens experience details. |
| **T-02** | User can select or change island and destination manually. | Must | Content and labels update to selected location. |
| **T-03** | Search and filters return only active, approved listings. | Must | Inactive/unapproved listing never appears publicly. |
| **T-04** | User can select date, time and party size and see a calculated total. | Must | Total updates deterministically before checkout. |
| **T-05** | User can complete a Stripe test payment and receive a booking. | Must | Successful webhook creates a paid booking exactly once. |
| **T-06** | Paid booking appears in Trips with a scannable QR voucher. | Must | Voucher resolves to the matching booking and redemption status. |
| **T-07** | User receives geofenced offer notifications only after consent. | Must | No location-triggered notification without permission and opt-in. |
| **T-08** | User can save an offer voucher without immediately booking. | Should | Saved voucher appears in Trips or Offers wallet with expiry. |
| **T-09** | User can cancel when policy allows and see status/refund result. | Should | Cancellation obeys configured policy and payment state. |

---

## 6. Vendor Portal Requirements

The vendor journey must be a **separate web experience**, not a hidden section inside the tourist
app. It should be responsive enough for a vendor to scan a QR code using a phone browser.

### Vendor onboarding flow

1. Create vendor account and verify email.
2. Create organization profile and primary location.
3. Submit business identity, contact information, tourism licence or supporting documents where
   applicable, payout details and authorized representative attestation.
4. Select subscription plan or launch plan configuration.
5. Submit for platform review.
6. After approval, create first experience and availability.

### Vendor capabilities

- Manage business profile, locations, contact details, media and operating hours.
- Create/edit experiences, variants, prices, capacity, schedules, blackout dates, pickup options and
  cancellation terms.
- Create promotions such as "Free rum punch with valid booking" with geography, start/end dates,
  redemption rules and inventory limits.
- View upcoming bookings and guest counts.
- Scan QR vouchers using the device camera and validate eligibility.
- Prevent duplicate redemption and show a clear already-redeemed state.
- View gross sales, fees, net amount, booking counts, redemptions and basic performance metrics.
- Invite staff and assign operational permissions.

### Requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| **V-01** | Vendor can submit an onboarding application with documents. | Must | Admin receives reviewable vendor record and files. |
| **V-02** | Only approved vendors can publish public listings. | Must | Draft and pending listings remain non-public. |
| **V-03** | Vendor can define capacity and availability by date/time. | Must | Bookings cannot exceed configured capacity. |
| **V-04** | Vendor can scan and validate a QR voucher. | Must | Valid scan marks redemption atomically and records actor/time. |
| **V-05** | Second scan of redeemed voucher is rejected with details. | Must | System displays already redeemed and original redemption timestamp. |
| **V-06** | Vendor can create a geofenced promotion with expiry and rules. | Should | Eligible tourist receives or sees offer within configured zone. |
| **V-07** | Vendor dashboard separates gross, platform fee and estimated net. | Should | Figures reconcile to booking/payment records. |

---

## 7. Admin Console Requirements

- **Dashboard:** pending vendor reviews, pending listing reviews, booking volume, gross booking
  value, active promotions, failed payments and redemption anomalies.
- **Vendor review:** approve, reject, request changes, suspend and record reasons.
- **Listing moderation:** approve, reject, unpublish and edit platform-controlled metadata.
- **Booking operations:** view payment, customer, vendor, voucher, cancellation and refund state.
- **Content management:** islands, destinations, categories, featured sections, FAQs and editorial
  destination content.
- **Promotion oversight:** approve or disable offers; investigate suspicious redemption patterns.
- **Audit log:** privileged changes, approvals, suspensions, refunds and role changes.

---

## 8. Core Journeys

### Journey A — Discover, book and redeem

1. Tourist selects Jamaica and Ocho Rios or grants location permission.
2. Explore displays approved nearby experiences.
3. Tourist opens an experience, selects date/time/party size and reviews the full total.
4. Tourist pays through Stripe.
5. Webhook confirms payment and creates/updates booking idempotently.
6. Trip entry and QR voucher become available.
7. Vendor scans QR code at arrival.
8. System confirms booking, validity, offer eligibility and redemption state.
9. Vendor validates entry; tourist voucher changes to redeemed/completed as appropriate.

### Journey B — Geofenced special

1. Tourist opts into location-based offers and notifications.
2. Tourist enters the configured radius around an attraction or vendor zone.
3. App displays a restrained notification: nearby experience plus qualifying special.
4. Tourist opens the offer and sees eligibility, expiry, distance and terms.
5. Tourist saves the voucher or proceeds to book.
6. If linked to a paid booking, the resulting QR code carries both booking and promotion references.
7. Vendor scan confirms whether the offer is valid and unused.

### Journey C — Vendor onboarding and first listing

1. Vendor registers and submits business details/documents.
2. Admin verifies the business and approves or requests changes.
3. Vendor creates an excursion with images, pricing, schedules, capacity and pickup details.
4. Admin approves the listing.
5. Listing becomes searchable and available in localized Jamaica discovery.

---

## 9. Geofencing, Offers, Vouchers and QR Redemption

### MVP geofencing approach

Implement location-aware offer eligibility with a practical MVP architecture. The app may use
foreground location checks and limited background geofencing where supported, but must remain
functional when background permissions are denied. **The experience must never depend on continuous
tracking.**

- Geofence defined by centre latitude/longitude, radius in metres, active dates/times, destination
  and optional vendor/location.
- Trigger only after explicit location and marketing/offer consent.
- Apply cooldowns to prevent repeated notifications.
- Do not trigger when the offer is expired, out of inventory, disabled, already redeemed, or not
  relevant to the selected island.
- Provide manual nearby-offers discovery as a fallback.

### Voucher states

`Issued` · `Saved` · `Attached to booking` · `Active` · `Redeemed` · `Expired` · `Cancelled` ·
`Invalidated`

### QR security rules

- QR code must contain an opaque signed token or short redemption identifier, **not** raw personal or
  payment data.
- Validation occurs server-side against booking, vendor, experience, time window, promotion and
  redemption state.
- Redemption must be **atomic** to prevent duplicate acceptance from simultaneous scans.
- Record scanner user, vendor, timestamp, device/session metadata and result.

---

## 10. Payments and Booking Model

Use Stripe in test mode during development. The MVP should support customer payment and preserve a
design path to Stripe Connect for vendor payouts. **Do not fake payment success in production
paths.**

### Required payment behaviours

- Create payment intent or checkout session only after server-side price calculation.
- **Never trust totals submitted by the client.**
- Use idempotency keys for booking/payment creation.
- Treat Stripe webhook confirmation as the payment source of truth.
- Store Stripe identifiers, status and amount; never store full card numbers or security codes.
- Display clear payment pending, failed, paid, refunded and partially refunded states.
- Use Stripe-provided test cards and clearly label mock/test data in non-production environments.

### Commercial configuration

- Vendor subscription plans may be configured between **USD 65 and USD 161 per month**, but plan
  names and exact benefits remain admin-configurable.
- Booking commission and processing-fee treatment must be configuration-driven rather than
  hard-coded.
- Taxes, service fees and promotional discounts must be individually itemized before payment.

---

## 11. Irie AI Concierge

Irie AI is the conversational discovery layer. It is **not allowed to invent** vendors, live prices,
opening hours, availability or booking facts. Its primary function is to translate natural-language
intent into platform search and present grounded results.

### MVP capabilities

- Answer requests such as breakfast nearby, activities under a budget, family-friendly options,
  rainy-day choices and one-day itineraries.
- Use selected/current destination, party size, budget, time and interests as context.
- Return concise recommendation cards linked to real listing IDs.
- Ask one clarification only when necessary, such as whether a budget is per person or total.
- Allow save, add to Trip, view details and book actions.
- Build a simple itinerary from available listings and estimated travel intervals.

### Guardrails

- Retrieval must be restricted to approved inventory and curated destination content.
- Clearly state when availability must be confirmed.
- Do not expose system prompts, secrets, internal IDs or private vendor/customer data.
- Apply rate limits and retain only the minimum conversation data needed for the feature.
- Provide a non-AI search fallback when the model or provider is unavailable.

---

## 12. Data Model

The implementation may use Supabase/PostgreSQL. The following entities are the **minimum** domain
model; the implementation may refine columns and constraints but **must not remove the relationships
or permission boundaries**.

| Entity | Purpose |
|---|---|
| `profiles` | User identity extension, role, preferences, selected island/destination. |
| `islands` | Country/island metadata, supported currencies, timezone, localized branding. |
| `destinations` | Towns/resort areas linked to islands. |
| `vendor_organizations` | Vendor legal/business profile, verification and status. |
| `vendor_members` | User-to-vendor membership and role. |
| `vendor_locations` | Physical operating locations and coordinates. |
| `vendor_documents` | Secure onboarding evidence and review state. |
| `experiences` | Public excursion/service content, category, description and status. |
| `experience_media` | Images and ordering. |
| `experience_options` | Price variants, age groups, add-ons or ticket types. |
| `availability_slots` | Date/time, capacity, booked count and status. |
| `promotions` | Offer rules, value, date range, limits and approval state. |
| `geofences` | Coordinates, radius, trigger/cooldown configuration. |
| `saved_items` | Tourist favourites. |
| `trips` | User trip container by destination/date. |
| `trip_items` | Bookings, saved experiences or itinerary entries. |
| `bookings` | Customer, vendor, experience, date/time, totals and lifecycle state. |
| `booking_guests` | Party composition and optional guest details. |
| `payments` | Stripe references, amounts and payment/refund state. |
| `vouchers` | Opaque token reference, booking/promotion association, expiry and state. |
| `voucher_redemptions` | Immutable scan and redemption events. |
| `notifications` | Delivery and read state. |
| `reviews` | Verified-booking reviews and moderation state. |
| `ai_conversations` | Minimal Irie AI conversation/session metadata. |
| `audit_logs` | Privileged action trail. |

---

## 13. Architecture and Repository Structure

For the MVP, use a **monorepo** rather than seven separate repositories. The earlier
multi-repository proposal was unnecessarily complex for a small founding team and would increase
deployment and dependency overhead.

```
caribbean-vip/
  apps/
    mobile/          # Expo React Native tourist app
    vendor-web/      # Vendor portal
    admin-web/       # Admin console
  packages/
    ui/              # Shared tokens/components where practical
    types/           # Shared TypeScript types and validation schemas
    config/          # Linting, TypeScript and environment configuration
  supabase/
    migrations/
    functions/
    seed/
  docs/
    architecture.md
    setup.md
    test-plan.md
```

### Recommended stack

- **Tourist app:** Expo + React Native + TypeScript.
- **Vendor/admin web:** Next.js + TypeScript.
- **Backend:** Supabase PostgreSQL, Auth, Storage, Row Level Security and Edge Functions where
  appropriate.
- **Payments:** Stripe; use Connect-ready abstractions without forcing full marketplace payouts into
  the first test milestone.
- **Maps/geolocation:** a supported maps provider with environment-configured keys; isolate
  provider-specific code.
- **Validation:** shared runtime schemas such as Zod.
- **Testing:** unit tests for pricing, permissions, voucher validation and booking state; integration
  tests for payment webhook and redemption; end-to-end smoke tests for core journeys.

---

## 14. Security, Privacy and Reliability

- Enforce Row Level Security for every user-accessible Supabase table.
- Keep vendor documents and private media in non-public storage buckets with signed access.
- Do not expose service-role keys or Stripe secrets to clients.
- Validate role and ownership server-side for vendor/admin operations.
- Collect precise location only with clear permission and use it only for requested nearby
  functionality and consented offers.
- Provide controls to disable location-based offers and clear Irie AI history.
- Implement basic rate limiting for authentication, AI requests, voucher scans and sensitive
  mutations.
- Use structured logs without payment-card or unnecessary personal data.
- Use error monitoring and a health/status check for core services.
- Provide graceful states for missing permissions, failed maps, failed AI, pending payment and poor
  connectivity.

---

## 15. Delivery Milestones and Acceptance Criteria

The build proceeds in milestones. Each milestone requires working code, migrations, seed data, tests
and updated setup documentation. Work must not continue after a failed validation without fixing the
failure or clearly recording the blocker.

| Milestone | Definition of done |
|---|---|
| **M0 — Repository foundation** | Monorepo, environment templates, shared lint/type configuration, CI checks, basic apps running. |
| **M1 — Auth and domain foundation** | Supabase schema, RLS, auth, roles, islands/destinations, seed data, navigation shells. |
| **M2 — Tourist discovery** | Explore, search, filters, maps, experience details, saving and destination localization. |
| **M3 — Booking and Stripe** | Availability, pricing, checkout, webhook, booking confirmation, Trips and QR voucher. |
| **M4 — Vendor portal** | Onboarding, listing management, availability, bookings, promotions and QR scanner/redemption. |
| **M5 — Admin console** | Vendor/listing review, content/configuration, booking operations and audit log. |
| **M6 — Geofenced offers** | Consent, eligibility, nearby popup, offer wallet, cooldown and voucher linkage. |
| **M7 — Irie AI** | Grounded discovery, recommendation cards, simple itinerary and graceful fallback. |
| **M8 — Hardening** | Automated tests, security review, accessibility, performance, error monitoring, deployment docs and demo accounts. |

### MVP release gate

- Fresh setup succeeds from documented instructions.
- No high-severity authentication, authorization, payment or redemption defect remains open.
- Core tourist booking flow passes end-to-end in test mode.
- Vendor QR redemption passes valid, invalid, expired and duplicate-scan scenarios.
- Admin can approve vendor and listing without database manipulation.
- Location-denied and AI-unavailable fallbacks work.
- Seeded Jamaica demo content supports an investor demonstration without fabricated live claims.

---

## Implementation assumptions to confirm later

These are recorded in [`open-decisions.md`](open-decisions.md) and are **not** blocking for the MVP
build:

- Legal operating entity and merchant-of-record structure.
- Whether vendors receive payouts through Stripe Connect at MVP launch or are settled manually during
  pilot.
- Final subscription tiers and booking commission model.
- Launch-island privacy notices, geolocation consent language, cancellation rules and vendor
  verification standard.
- Maps provider and notification provider based on budget and target deployment environment.
- Whether the tourist application launches as native app-store apps immediately or begins with an
  Expo-managed pilot distribution.

## Final build principle

> Do not confuse "production-like" with "production-approved." A strong MVP can be built with test
> payments, robust permissions, migrations and deployment configuration. Before accepting real
> payments and vendors, the founding team must still complete legal, financial, privacy, security and
> operational decisions identified in the final checklist.
