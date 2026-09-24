-- The island's own greeting.
--
-- Irie opened every conversation with "Wah Gwaan!" — Jamaican Patois, hardcoded in the client. It
-- is correct on one island and borrowed on the other two, and the whole reason to open in dialect
-- is that it reads as built *here* rather than built for here. A guest in Bridgetown greeted in
-- Jamaican gets the opposite signal.
--
-- It lives beside `in_app_brand` because it is the same kind of thing: the localized in-app voice
-- of a market, set per island, so a new market arrives with its own rather than inheriting one.
alter table islands add column greeting text not null default 'Hello!';

comment on column islands.greeting is
  'How this island says hello, in its own words — Irie''s opening line. Localized per market.';

update islands set greeting = 'Wah Gwaan!'   where code = 'JM';
update islands set greeting = 'Wah goin on!' where code = 'KY';
update islands set greeting = 'Wuh gine on!' where code = 'BB';
update islands set greeting = 'Wah gwan!'    where code = 'AG';
