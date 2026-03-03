-- Support tickets for contact/support form (replaces db.json)
CREATE TABLE IF NOT EXISTS support_tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    subject         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    priority        TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    category        TEXT NOT NULL CHECK (category IN ('TECHNICAL', 'BILLING', 'FEATURE_REQUEST', 'OTHER', 'COMPLIANCE')),
    messages        JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_business ON support_tickets (business_id);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY st_insert ON support_tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY st_select ON support_tickets FOR SELECT
    USING (auth.uid() = user_id);
