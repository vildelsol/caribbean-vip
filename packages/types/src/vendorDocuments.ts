import type { IslandCode } from './domain.ts';
import type { VendorBusinessType } from './vendor.ts';

/**
 * Which documents a vendor must provide, by island and business type.
 *
 * The content is the conclusion of `docs/vendor-document-requirements.md` (research as of
 * 2026-10-29, not legal advice, to be confirmed by local counsel). Change them together. This
 * module is pure so the rules can be tested without a database, and so the vendor portal and the
 * admin console cannot disagree about what "complete" means.
 */

/**
 * - `required`: blocks approval until an accepted, unexpired document is on file.
 * - `conditional`: depends on the vendor's circumstances; an admin confirms whether it applies. Does
 *   not block on its own, but a document uploaded against it is reviewed like any other.
 * - `recommended`: never blocks.
 */
export type RequirementLevel = 'required' | 'conditional' | 'recommended';

export interface DocumentRequirement {
  /** Stored in `vendor_documents.kind`. Never reuse or rename a key: existing rows carry it. */
  key: string;
  label: string;
  help: string;
  islands: readonly IslandCode[] | 'all';
  appliesTo: readonly VendorBusinessType[] | 'all';
  level: RequirementLevel;
  /** A licence or certificate that lapses. Upload then requires an expiry date. */
  hasExpiry: boolean;
  /** A licence or registration with a number an admin can check against a public list. */
  hasNumber: boolean;
  /** True where the island's rule depends on a legal question still open with counsel. */
  confirmWithCounsel?: boolean;
}

const WATER: readonly VendorBusinessType[] = ['water'];
const TOURISH: readonly VendorBusinessType[] = ['tour', 'culture', 'water', 'transport'];

export const DOCUMENT_REQUIREMENTS: readonly DocumentRequirement[] = [
  // ---- Platform standard: every island, every vendor -------------------------------------------
  {
    key: 'entity_proof',
    label: 'Company or business registration',
    help: 'Certificate of incorporation, or business-name registration for a sole trader.',
    islands: 'all',
    appliesTo: 'all',
    level: 'required',
    hasExpiry: false,
    hasNumber: true,
  },
  {
    key: 'owner_id',
    label: 'Government photo ID of an owner or director',
    help: 'Passport, driver licence or national ID. One document per owner or director.',
    islands: 'all',
    appliesTo: 'all',
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
  },
  {
    key: 'public_liability',
    label: 'Public liability insurance',
    help: 'The insurer\'s certificate or schedule showing cover for the activities you sell, and its expiry date.',
    islands: 'all',
    appliesTo: 'all',
    level: 'required',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'bank_proof',
    label: 'Bank account proof',
    help: 'A letter from your bank confirming the business account, or a recent statement. Used for payouts.',
    islands: 'all',
    appliesTo: 'all',
    level: 'required',
    hasExpiry: false,
    hasNumber: false,
  },
  {
    key: 'tax_registration',
    label: 'Tax registration',
    help: 'Taxpayer Registration Number (Jamaica) or Barbados Revenue Authority registration (Barbados).',
    islands: ['JM', 'BB'],
    appliesTo: 'all',
    level: 'required',
    hasExpiry: false,
    hasNumber: true,
  },

  // ---- Barbados: Travel Services Act, CAP 373A -------------------------------------------------
  {
    key: 'bb.tour_operator_licence',
    label: 'Tour operator licence (Registrar of Travel Services)',
    help: 'Issued by the Ministry of Tourism under the Travel Services Act. Valid one year.',
    islands: ['BB'],
    appliesTo: TOURISH,
    level: 'required',
    hasExpiry: true,
    hasNumber: true,
    confirmWithCounsel: true,
  },
  {
    key: 'bb.police_certificate',
    label: 'Police certificate of character',
    help: 'One for each partner or director.',
    islands: ['BB'],
    appliesTo: TOURISH,
    level: 'required',
    hasExpiry: false,
    hasNumber: false,
    confirmWithCounsel: true,
  },
  {
    key: 'bb.bra_clearance',
    label: 'VAT and income tax clearance (Barbados Revenue Authority)',
    help: 'A current clearance certificate.',
    islands: ['BB'],
    appliesTo: TOURISH,
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
    confirmWithCounsel: true,
  },
  {
    key: 'bb.nis_clearance',
    label: 'National Insurance clearance',
    help: 'A current NIS clearance certificate.',
    islands: ['BB'],
    appliesTo: TOURISH,
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
    confirmWithCounsel: true,
  },
  {
    key: 'bb.security_bond',
    label: 'Security bond (US$10,000)',
    help: 'Evidence the bond required for a tour operator licence is in place.',
    islands: ['BB'],
    appliesTo: TOURISH,
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
    confirmWithCounsel: true,
  },

  // ---- Jamaica: Tourist Board licences through TPDCo -------------------------------------------
  {
    key: 'jm.tour_operator_licence',
    label: 'Domestic tour operator licence (TPDCo)',
    help: 'Tourist Board licence for tour operators. Expires 31 March each year.',
    islands: ['JM'],
    appliesTo: ['tour', 'transport'],
    level: 'required',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'jm.attraction_licence',
    label: 'Attraction licence (TPDCo)',
    help: 'For attractions that charge an entry fee. Expires 30 April.',
    islands: ['JM'],
    appliesTo: ['culture'],
    level: 'required',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'jm.water_sports_licence',
    label: 'Water sports operator licence (TPDCo)',
    help: 'Tourist Board licence for water sports. Expires 30 April.',
    islands: ['JM'],
    appliesTo: WATER,
    level: 'required',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'jm.good_standing',
    label: 'Companies Office letter of good standing',
    help: 'For incorporated businesses. TPDCo needs at least four weeks of validity left when you apply.',
    islands: ['JM'],
    appliesTo: TOURISH,
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
  },
  {
    key: 'jm.guide_certification',
    label: 'Tour guide certification, first aid and CPR',
    help: 'TPDCo guide certificate and first aid / CPR for each guide, with a list of your guides.',
    islands: ['JM'],
    appliesTo: ['tour', 'culture'],
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
  },
  {
    key: 'jm.planning_approval',
    label: 'Planning approval for your premises',
    help: 'From the local municipal corporation, for commercial and home-based offices.',
    islands: ['JM'],
    appliesTo: ['tour', 'culture', 'transport'],
    level: 'recommended',
    hasExpiry: false,
    hasNumber: false,
  },
  {
    key: 'jm.nepa_beach_licence',
    label: 'NEPA beach licence',
    help: 'One for each location you operate from.',
    islands: ['JM'],
    appliesTo: WATER,
    level: 'required',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'jm.vessel_certificates',
    label: 'Vessel safety certificate and certificate of registry (MAJ)',
    help: 'Maritime Authority of Jamaica certificates for each vessel.',
    islands: ['JM'],
    appliesTo: WATER,
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
  },
  {
    key: 'jm.coxswain_certificate',
    label: 'Coxswain certificate of competency (MAJ)',
    help: 'For each skipper, showing the designated harbour.',
    islands: ['JM'],
    appliesTo: WATER,
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
  },
  {
    key: 'jm.water_first_aid',
    label: 'First aid and CPR (Royal Life Saving Society)',
    help: 'For every person involved in water sports activities.',
    islands: ['JM'],
    appliesTo: WATER,
    level: 'required',
    hasExpiry: true,
    hasNumber: false,
  },
  {
    key: 'jm.water_management_plan',
    label: 'Water sports management plan',
    help: 'Maintenance, safety, disaster preparedness, environmentally safe practices and staff training.',
    islands: ['JM'],
    appliesTo: WATER,
    level: 'required',
    hasExpiry: false,
    hasNumber: false,
  },
  {
    key: 'jm.fisheries_licence',
    label: 'Fisheries licence',
    help: 'For vessels and employees where it applies to your activity.',
    islands: ['JM'],
    appliesTo: WATER,
    level: 'conditional',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'jm.food_permits',
    label: 'Food establishment certificate and handler permits',
    help: 'If you serve food on your tours.',
    islands: ['JM'],
    appliesTo: ['tour', 'culture', 'food'],
    level: 'conditional',
    hasExpiry: true,
    hasNumber: false,
  },

  // ---- Cayman Islands --------------------------------------------------------------------------
  {
    key: 'ky.trade_business_licence',
    label: 'Trade and Business licence',
    help: 'One for each location you trade from.',
    islands: ['KY'],
    appliesTo: 'all',
    level: 'required',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'ky.local_companies_licence',
    label: 'Local Companies (Control) licence',
    help: 'If your company is not Caymanian-owned and controlled.',
    islands: ['KY'],
    appliesTo: 'all',
    level: 'conditional',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'ky.vessel_and_captain',
    label: 'Vessel registration and captain\'s certificate',
    help: 'If you operate boats. Confirm current requirements with the Maritime Authority of the Cayman Islands.',
    islands: ['KY'],
    appliesTo: ['tour', 'water', 'transport'],
    level: 'conditional',
    hasExpiry: true,
    hasNumber: true,
    confirmWithCounsel: true,
  },
  {
    key: 'ky.wildlife_interaction_licence',
    label: 'Wildlife Interaction Zone licence (Department of Environment)',
    help: 'If you run Stingray City or Sandbar trips.',
    islands: ['KY'],
    appliesTo: ['tour', 'water'],
    level: 'conditional',
    hasExpiry: true,
    hasNumber: true,
  },
  {
    key: 'ky.port_authority_permit',
    label: 'Port Authority permit',
    help: 'If you solicit passengers at the cruise port.',
    islands: ['KY'],
    appliesTo: ['tour', 'water', 'transport'],
    level: 'conditional',
    hasExpiry: true,
    hasNumber: false,
    confirmWithCounsel: true,
  },
];

export function documentRequirementsFor(
  island: IslandCode,
  businessType: VendorBusinessType | null,
): DocumentRequirement[] {
  return DOCUMENT_REQUIREMENTS.filter(
    (r) =>
      (r.islands === 'all' || r.islands.includes(island)) &&
      (r.appliesTo === 'all' || (businessType !== null && r.appliesTo.includes(businessType))),
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ReviewState = 'pending' | 'accepted' | 'rejected';

export interface DocumentRecord {
  kind: string;
  reviewState: ReviewState;
  expiresOn: string | null; // YYYY-MM-DD
  createdAt: string; // ISO
}

export type RequirementState = 'missing' | 'pending' | 'accepted' | 'rejected' | 'expired';

/** A document with this many days or fewer left is flagged as expiring soon. */
export const EXPIRY_WARNING_DAYS = 28;

const DAY_MS = 86_400_000;

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from `now` (UTC date) to an expiry date; negative once it has passed. */
export function daysUntil(expiresOn: string, now: Date): number {
  return Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${todayKey(now)}T00:00:00Z`)) / DAY_MS);
}

export interface RequirementStatus {
  requirement: DocumentRequirement;
  state: RequirementState;
  /** The newest document for this requirement, whatever its state. */
  document: DocumentRecord | null;
  expiringSoon: boolean;
}

/**
 * The state of each requirement from the vendor's documents.
 *
 * The NEWEST document per kind decides, not the best one: a renewal that an admin rejected must not
 * be masked by an older accepted copy, or a vendor could upload junk and stay approved on the strength
 * of last year's licence. An accepted document whose expiry date has passed counts as `expired`.
 */
export function requirementStatuses(
  requirements: readonly DocumentRequirement[],
  documents: readonly DocumentRecord[],
  now: Date,
): RequirementStatus[] {
  return requirements.map((requirement) => {
    const newest =
      documents
        .filter((d) => d.kind === requirement.key)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

    if (!newest) return { requirement, state: 'missing', document: null, expiringSoon: false };

    const days = newest.expiresOn ? daysUntil(newest.expiresOn, now) : null;
    if (newest.reviewState === 'accepted' && days !== null && days < 0) {
      return { requirement, state: 'expired', document: newest, expiringSoon: false };
    }
    return {
      requirement,
      state: newest.reviewState,
      document: newest,
      expiringSoon: newest.reviewState === 'accepted' && days !== null && days <= EXPIRY_WARNING_DAYS,
    };
  });
}

export interface ApprovalReadiness {
  ready: boolean;
  /** Required items that are not accepted and unexpired. */
  blocking: RequirementStatus[];
  /** Conditional items with nothing accepted: an admin confirms whether each applies. */
  toConfirm: RequirementStatus[];
}

export function approvalReadiness(statuses: readonly RequirementStatus[]): ApprovalReadiness {
  const blocking = statuses.filter((s) => s.requirement.level === 'required' && s.state !== 'accepted');
  const toConfirm = statuses.filter((s) => s.requirement.level === 'conditional' && s.state !== 'accepted');
  return { ready: blocking.length === 0, blocking, toConfirm };
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

export const DOCUMENT_UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] as readonly string[],
} as const;

export class DocumentInvalid extends Error {}

export interface DocumentUploadInput {
  requirement: DocumentRequirement;
  file: { name: string; size: number; type: string };
  documentNumber: string;
  expiresOn: string;
  now: Date;
}

/** What the database stores for a valid upload; throws `DocumentInvalid` otherwise. */
export function parseDocumentUpload(i: DocumentUploadInput): {
  documentNumber: string | null;
  expiresOn: string | null;
} {
  if (!DOCUMENT_UPLOAD_LIMITS.mimeTypes.includes(i.file.type)) {
    throw new DocumentInvalid('Upload a PDF, JPG or PNG.');
  }
  if (i.file.size <= 0) throw new DocumentInvalid('That file is empty.');
  if (i.file.size > DOCUMENT_UPLOAD_LIMITS.maxBytes) {
    throw new DocumentInvalid('That file is over 10 MB.');
  }

  const number = i.documentNumber.trim();
  if (i.requirement.hasNumber && number.length === 0) {
    throw new DocumentInvalid('Enter the number shown on the document.');
  }
  if (number.length > 80) throw new DocumentInvalid('That document number is too long.');

  let expiresOn: string | null = null;
  if (i.requirement.hasExpiry) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.expiresOn) || Number.isNaN(Date.parse(i.expiresOn))) {
      throw new DocumentInvalid('Enter the date this document expires.');
    }
    if (daysUntil(i.expiresOn, i.now) < 0) {
      throw new DocumentInvalid('That document has already expired. Upload the renewed one.');
    }
    expiresOn = i.expiresOn;
  }

  return { documentNumber: number.length > 0 ? number : null, expiresOn };
}

/** A storage-safe file name: the path is what the bucket policy reads, so keep it boring. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(-80);
  return cleaned.length > 0 ? cleaned : 'document';
}
