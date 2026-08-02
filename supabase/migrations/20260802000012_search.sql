-- M2 · Full-text search over the public catalogue — T-03
--
-- The important property is that search cannot become a back door around RLS. `search_experiences`
-- is deliberately NOT `security definer`: it runs as the caller, so every row it returns has
-- already passed `experiences_public_read`. A definer function here would happily return drafts.

-- --------------------------------------------------------------------------
-- Generated tsvector + GIN index
-- --------------------------------------------------------------------------
--
-- A generated column rather than a trigger: it cannot drift from the row it describes, and there
-- is no ordering hazard between "update the row" and "update the index source".
--
-- Weights: title (A) beats summary (B) beats description (C), so a listing named "Rafting" ranks
-- above one that merely mentions rafting in a paragraph.

alter table experiences
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored;

create index experiences_search_idx on experiences using gin (search_vector);

-- Trigram index for the typo/partial-word path. Full-text alone cannot match "catama" against
-- "Catamaran", and a tourist typing into a phone on a beach will not always finish the word.
--
-- Note `<%` (word similarity), not `%` (whole-string similarity): "catama" against the whole
-- title "Catamaran Snorkel & Sunset" scores far below the 0.3 threshold, because most of the
-- title is unmatched. Word similarity compares the query against the closest WORD in the title,
-- which is what a partial-word search actually means.
create extension if not exists pg_trgm;
create index experiences_title_trgm_idx on experiences using gin (title gin_trgm_ops);

-- --------------------------------------------------------------------------
-- search_experiences
-- --------------------------------------------------------------------------
--
-- Mirrors the predicates in packages/types/src/search.ts. The two must agree: the server applies
-- them for the initial query, the client refines an already-fetched list, and a mismatch shows up
-- as results that flicker when a filter is toggled.

create or replace function search_experiences(
  p_query            text default '',
  p_island_id        uuid default null,
  p_destination_id   uuid default null,
  p_categories       experience_category[] default null,
  p_min_price_minor  bigint default null,
  p_max_price_minor  bigint default null,
  p_max_duration_min integer default null,
  p_limit            integer default 50,
  p_offset           integer default 0
)
returns table (
  id                uuid,
  vendor_org_id     uuid,
  island_id         uuid,
  destination_id    uuid,
  category          experience_category,
  title             text,
  summary           text,
  duration_minutes  integer,
  from_amount_minor bigint,
  currency          currency_code,
  is_demo           boolean,
  rank              real
)
language sql
stable
-- NOT security definer. Runs as the caller so RLS still applies (T-03, V-02).
as $$
  with q as (
    select
      nullif(btrim(coalesce(p_query, '')), '') as raw,
      case
        when nullif(btrim(coalesce(p_query, '')), '') is null then null
        -- websearch_to_tsquery tolerates whatever a person types; plainto_ would choke on
        -- quotes and operators.
        else websearch_to_tsquery('english', btrim(p_query))
      end as ts
  )
  select
    e.id,
    e.vendor_org_id,
    e.island_id,
    e.destination_id,
    e.category,
    e.title,
    e.summary,
    e.duration_minutes,
    e.from_amount_minor,
    e.currency,
    e.is_demo,
    case
      when q.ts is null then 0::real
      else greatest(
        ts_rank(e.search_vector, q.ts),
        -- Word similarity keeps partial words findable; scaled below a genuine full-text hit
        -- so an exact match always outranks a fuzzy one.
        (word_similarity(q.raw, e.title) * 0.5)::real
      )
    end as rank
  from experiences e
  cross join q
  where
    (q.ts is null or e.search_vector @@ q.ts or q.raw <% e.title)
    and (p_island_id is null or e.island_id = p_island_id)
    and (p_destination_id is null or e.destination_id = p_destination_id)
    and (p_categories is null or cardinality(p_categories) = 0 or e.category = any (p_categories))
    and (p_min_price_minor is null or e.from_amount_minor >= p_min_price_minor)
    and (p_max_price_minor is null or e.from_amount_minor <= p_max_price_minor)
    and (p_max_duration_min is null or e.duration_minutes <= p_max_duration_min)
  order by rank desc, e.title asc
  limit greatest(least(coalesce(p_limit, 50), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function search_experiences is
  'Public catalogue search. Runs as the caller so RLS decides visibility — never make this '
  'security definer, or unapproved listings become searchable (T-03, V-02).';

-- --------------------------------------------------------------------------
-- Published review aggregate
-- --------------------------------------------------------------------------
--
-- A view so the rating shown on a card comes from moderated reviews only. Written as a plain view
-- over `reviews`, which keeps its own RLS: an unpublished review contributes to nothing.

create view experience_ratings
with (security_invoker = true)
as
  select
    r.experience_id,
    round(avg(r.rating)::numeric, 2) as average_rating,
    count(*)::integer                as review_count
  from reviews r
  where r.moderation_state = 'published'
  group by r.experience_id;
