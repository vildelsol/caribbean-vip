/**
 * Database types.
 *
 * Hand-written for M1 rather than generated, because generation requires a running Supabase
 * project and this repo must stay usable with zero credentials (operating rule 4). Once a hosted
 * project exists, replace this file with:
 *
 *   supabase gen types typescript --project-id <id> > packages/supabase/src/database.types.ts
 *
 * Only the tables the apps read directly in M1–M2 are typed here. The remainder arrive with the
 * milestone that first queries them, so the file never claims coverage it does not have.
 */

import type {
  Currency,
  ExperienceCategory,
  ListingStatus,
  UserRole,
  VendorStatus,
} from '@cvip/types';

export type IslandRow = {
  id: string;
  code: string;
  name: string;
  /** PRD §3: localized IN-APP identity ("VIP Jamaica"). The app itself is never renamed. */
  in_app_brand: string;
  currency: Currency;
  timezone: string;
  hero_media_path: string | null;
  is_active: boolean;
}

export type DestinationRow = {
  id: string;
  island_id: string;
  name: string;
  slug: string;
  centre_lat: number;
  centre_lng: number;
  editorial_content: string | null;
  sort_order: number;
  is_active: boolean;
}

export type ProfileRow = {
  id: string;
  role: UserRole;
  display_name: string | null;
  selected_island_id: string | null;
  selected_destination_id: string | null;
  interests: ExperienceCategory[];
  party_size: number | null;
  currency: Currency;
  locale: string;
  /** T-07: both flags are required before any location leaves the device. */
  location_consent: boolean;
  offer_consent: boolean;
  notification_consent: boolean;
}

export type ExperienceRow = {
  id: string;
  vendor_org_id: string;
  island_id: string;
  destination_id: string;
  category: ExperienceCategory;
  title: string;
  summary: string | null;
  description: string | null;
  duration_minutes: number;
  inclusions: string[];
  pickup_info: string | null;
  meeting_point: string | null;
  from_amount_minor: number;
  currency: Currency;
  status: ListingStatus;
  /** Operating rule 9 — surfaced in the UI so demo content is never mistaken for live. */
  is_demo: boolean;
}

export type VendorOrganizationRow = {
  id: string;
  island_id: string;
  legal_name: string;
  trading_name: string;
  status: VendorStatus;
  description: string | null;
  is_demo: boolean;
}

/** Minimal typing for tables the apps do not yet read column-by-column. */
type UntypedTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
}

/**
 * The shape must match what `supabase-js` expects — Tables, Views, Functions, Enums and
 * CompositeTypes all present, and every table carrying a `Relationships` key. Omitting them
 * makes the client's generics collapse to `never`, which surfaces as inscrutable "not assignable
 * to parameter of type never" errors at every call site.
 */
export interface Database {
  public: {
    Tables: {
      islands: {
        Row: IslandRow;
        Insert: Partial<IslandRow>;
        Update: Partial<IslandRow>;
        Relationships: [];
      };
      destinations: {
        Row: DestinationRow;
        Insert: Partial<DestinationRow>;
        Update: Partial<DestinationRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      experiences: {
        Row: ExperienceRow;
        Insert: Partial<ExperienceRow>;
        Update: Partial<ExperienceRow>;
        Relationships: [];
      };
      vendor_organizations: {
        Row: VendorOrganizationRow;
        Insert: Partial<VendorOrganizationRow>;
        Update: Partial<VendorOrganizationRow>;
        Relationships: [];
      };
      // Present so queries compile; typed properly in the milestone that first reads them.
      ai_conversations: UntypedTable;
      saved_items: UntypedTable;
      trips: UntypedTable;
      bookings: UntypedTable;
      vouchers: UntypedTable;
      promotions: UntypedTable;
      availability_slots: UntypedTable;
      experience_options: UntypedTable;
      experience_media: UntypedTable;
      notifications: UntypedTable;
      platform_settings: UntypedTable;
      vendor_members: UntypedTable;
      vendor_locations: UntypedTable;
      vendor_documents: UntypedTable;
      reviews: UntypedTable;
      audit_logs: UntypedTable;
    };
    // `{ [_ in never]: never }`, not `Record<string, never>`. The latter claims EVERY key
    // exists, so `from('islands')` resolves against Views first and collapses to `never`.
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
