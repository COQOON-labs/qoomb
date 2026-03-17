-- Phase 3: Hive Management, Notifications, Messaging, Activity Log
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. HIVE SETTINGS (JSONB column for extensible hive configuration)
-- ---------------------------------------------------------------------------
ALTER TABLE hives
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 2. NOTIFICATION PREFERENCES (per-person, per-hive opt-in/out)
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preferences (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hive_id     UUID        NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  person_id   UUID        NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  -- JSON map: notificationType -> { inApp: bool, email: bool }
  -- e.g. {"member_joined": {"inApp": true, "email": false}, ...}
  preferences JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_notification_preferences UNIQUE (hive_id, person_id)
);

CREATE INDEX idx_notification_preferences_hive  ON notification_preferences (hive_id);
CREATE INDEX idx_notification_preferences_person ON notification_preferences (person_id);

-- RLS: each hive only sees its own rows
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_hive_isolation
  ON notification_preferences
  USING (hive_id = current_setting('app.hive_id')::uuid);

-- ---------------------------------------------------------------------------
-- 3. NOTIFICATIONS (in-app notification feed)
-- ---------------------------------------------------------------------------
-- title and body are encrypted (AES-256-GCM, hive-scoped key)
CREATE TABLE notifications (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hive_id             UUID        NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  recipient_person_id UUID        NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  -- Enum-like type for client-side routing (not encrypted — structural metadata)
  notification_type   VARCHAR(50) NOT NULL,
  -- AES-256-GCM ciphertext (hive-scoped key)
  title               TEXT        NOT NULL,
  -- AES-256-GCM ciphertext (hive-scoped key)
  body                TEXT,
  -- Polymorphic reference for deep-linking (e.g. event, list, person)
  resource_type       VARCHAR(50),
  resource_id         UUID,
  is_read             BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_hive          ON notifications (hive_id);
CREATE INDEX idx_notifications_recipient     ON notifications (hive_id, recipient_person_id, is_read);
CREATE INDEX idx_notifications_created       ON notifications (hive_id, recipient_person_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_hive_isolation
  ON notifications
  USING (hive_id = current_setting('app.hive_id')::uuid);

-- ---------------------------------------------------------------------------
-- 4. DIRECT MESSAGES (encrypted in-hive messaging)
-- ---------------------------------------------------------------------------
-- body is encrypted (AES-256-GCM, hive-scoped key)
CREATE TABLE direct_messages (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hive_id             UUID        NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  sender_person_id    UUID        NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  recipient_person_id UUID        NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  -- AES-256-GCM ciphertext (hive-scoped key)
  body                TEXT        NOT NULL,
  is_read             BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_direct_messages_hive         ON direct_messages (hive_id);
CREATE INDEX idx_direct_messages_conversation ON direct_messages (hive_id, sender_person_id, recipient_person_id, created_at DESC);
CREATE INDEX idx_direct_messages_inbox        ON direct_messages (hive_id, recipient_person_id, is_read);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY direct_messages_hive_isolation
  ON direct_messages
  USING (hive_id = current_setting('app.hive_id')::uuid);

-- ---------------------------------------------------------------------------
-- 5. ACTIVITY EVENTS (change feed / audit trail)
-- ---------------------------------------------------------------------------
-- summary is encrypted (AES-256-GCM, hive-scoped key)
CREATE TABLE activity_events (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hive_id         UUID        NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  actor_person_id UUID        REFERENCES persons(id) ON DELETE SET NULL,
  -- Enum-like action type (not encrypted — structural metadata)
  action          VARCHAR(50) NOT NULL,
  resource_type   VARCHAR(50) NOT NULL,
  resource_id     UUID        NOT NULL,
  -- AES-256-GCM ciphertext (hive-scoped key): human-readable summary
  summary         TEXT,
  -- Raw metadata snapshot (JSONB, unencrypted — no PII, structural only)
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_events_hive    ON activity_events (hive_id, created_at DESC);
CREATE INDEX idx_activity_events_resource ON activity_events (hive_id, resource_type, resource_id);
CREATE INDEX idx_activity_events_actor   ON activity_events (hive_id, actor_person_id);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_events_hive_isolation
  ON activity_events
  USING (hive_id = current_setting('app.hive_id')::uuid);
