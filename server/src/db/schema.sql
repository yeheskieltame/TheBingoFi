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

-- reply_to: the id of the parent message being replied to, absent for a
-- top-level post (see plaza/plaza.ts). ADD COLUMN IF NOT EXISTS rather than
-- part of the CREATE TABLE above because this column was added after
-- plaza_messages already existed in production - this line must stay
-- idempotent and non-destructive (no DROP/RECREATE) so it applies cleanly
-- to a database that already has real messages in it. No FK/REFERENCES: a
-- reply's parent existence + max-depth-1 rule are enforced in application
-- code at insert time (plaza.ts's addMessage), and a parent id here is
-- allowed to point at nothing (e.g. the in-memory ring buffer evicted it) -
-- see this column's doc in plaza.ts for why that's fine, not a bug.
ALTER TABLE plaza_messages ADD COLUMN IF NOT EXISTS reply_to uuid;

-- attachment: structured showcase attachment (skill card / match result
-- card / board snapshot - see plaza/plaza.ts's PlazaAttachment), nullable,
-- stored exactly as validated. Same ADD COLUMN IF NOT EXISTS pattern as
-- reply_to above (added after plaza_messages already existed in
-- production) - idempotent, no DROP/RECREATE, safe on a database that
-- already has real messages in it. A row written before this column
-- existed simply has attachment NULL - plaza.ts's withNormalizedAttachment
-- synthesizes an equivalent `{ kind: "skill", skillId }` from the legacy
-- skill_id column on read, so old rows keep displaying correctly.
ALTER TABLE plaza_messages ADD COLUMN IF NOT EXISTS attachment jsonb;
