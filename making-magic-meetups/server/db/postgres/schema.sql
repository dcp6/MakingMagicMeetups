CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_plain TEXT,
  preferred_store_place_id TEXT,
  preferred_store_name TEXT,
  preferred_store_address TEXT,
  preferred_store_url TEXT,
  preferred_store_website TEXT,
  preferred_store_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS accounts_username_lower_idx ON accounts ((LOWER(username)));
CREATE INDEX IF NOT EXISTS accounts_email_lower_idx ON accounts ((LOWER(email)));

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  request_ip TEXT,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_account_id_idx
  ON password_reset_tokens (account_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx
  ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_events (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  identifier TEXT,
  request_ip TEXT,
  event_type TEXT NOT NULL,
  detail TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS password_reset_events_created_at_idx
  ON password_reset_events (created_at);
CREATE INDEX IF NOT EXISTS password_reset_events_account_id_idx
  ON password_reset_events (account_id);

CREATE TABLE IF NOT EXISTS my_cards (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  requesting INTEGER NOT NULL DEFAULT 0,
  asking_quantity INTEGER,
  asking_price_cents INTEGER,
  offer_price_cents INTEGER,
  scryfall_id TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  image_small TEXT,
  image_normal TEXT,
  image_small_back TEXT,
  image_normal_back TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, card_name)
);

CREATE INDEX IF NOT EXISTS my_cards_account_id_idx ON my_cards (account_id);
CREATE INDEX IF NOT EXISTS my_cards_account_id_card_name_idx ON my_cards (account_id, card_name);

-- Legacy mirror table retained for compatibility with current app routes.
CREATE TABLE IF NOT EXISTS account_card_items (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  asking_quantity INTEGER,
  asking_price_cents INTEGER,
  scryfall_id TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  image_small TEXT,
  image_normal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, card_name)
);

CREATE INDEX IF NOT EXISTS account_card_items_account_id_idx ON account_card_items (account_id);
