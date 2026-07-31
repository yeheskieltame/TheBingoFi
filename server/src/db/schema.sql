-- ponytail: idempotent boot-time migration (CREATE TABLE IF NOT EXISTS), no
-- migration framework - see migrate.ts, which just runs this file verbatim.
-- Safe to re-run on every server boot.

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  nickname text,
  wallet text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- player_id references players(id): quest progress only ever gets recorded
-- against a real, stable account (see identity/identity.ts) - never the
-- ephemeral per-room seat id from realtime/rooms.ts.
CREATE TABLE IF NOT EXISTS quest_progress (
  player_id uuid NOT NULL REFERENCES players(id),
  quest_id text NOT NULL,
  period_key text NOT NULL,
  count int NOT NULL,
  completed boolean NOT NULL,
  PRIMARY KEY (player_id, quest_id, period_key)
);

-- No FK to players: a guest playing the HTTP daily challenge with no
-- identity gets a fresh, never-persisted-as-a-player uuid per submission
-- (see api/dailyLeaderboard.ts) - "best score per player per day" only
-- means something once player_id is stable across submissions.
CREATE TABLE IF NOT EXISTS daily_scores (
  date text NOT NULL,
  player_id uuid NOT NULL,
  nickname text NOT NULL,
  score int NOT NULL,
  calls_to_bingo int NOT NULL,
  PRIMARY KEY (date, player_id)
);

-- player_id nullable + no FK: Plaza works for guests who never established
-- an identity at all (see plaza/plaza.ts) - a message from one of those is
-- simply recorded with player_id NULL.
CREATE TABLE IF NOT EXISTS plaza_messages (
  id uuid PRIMARY KEY,
  player_id uuid,
  nickname text NOT NULL,
  text text NOT NULL,
  skill_id int,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS plaza_messages_created_at_idx ON plaza_messages (created_at DESC);
