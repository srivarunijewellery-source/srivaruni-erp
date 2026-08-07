-- How the three benefit families interact, as settings rather than as
-- rules baked into the counter.
--
-- A bill claims ONE family: a discount, a coupon, or gifts. Within
-- gifts, several offers can land together -- two offers earning two
-- different free pieces is the ordinary case, and treating that as
-- stacking would block it.
--
-- Schemes are OFFERED, not applied. The counter was showing a scheme
-- discount and never subtracting it, which reads as a discount that does
-- not work; applying it silently instead takes the decision away from
-- the person facing the customer, who often has a reason not to give it.
alter table discount_settings
  add column if not exists exclusive_benefits  boolean not null default true,
  add column if not exists stack_gifts         boolean not null default true,
  add column if not exists auto_apply_schemes  boolean not null default false;

comment on column discount_settings.exclusive_benefits is
  'One of discount / coupon / gift per bill. Off allows them together.';
comment on column discount_settings.stack_gifts is
  'Several gift offers can apply to the same bill.';
comment on column discount_settings.auto_apply_schemes is
  'Scheme discounts apply automatically instead of being offered.';
