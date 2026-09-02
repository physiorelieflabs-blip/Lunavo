alter table merchants
  add column if not exists currency text not null default 'USD';