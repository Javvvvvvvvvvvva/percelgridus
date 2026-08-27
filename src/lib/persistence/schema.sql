-- PARCELGRID US — reference persistence schema (PostgreSQL).
--
-- This DDL is the target a real store maps onto; the library ships an in-memory
-- implementation of the same contract (site-repository.ts). It encodes the two
-- README-US persistence rules explicitly:
--
--   1. UUID primary key, APN as source record. `site.site_id` is an opaque
--      PARCELGRID UUID. External identifiers (APN, provider ids) live in a
--      separate table, many-per-site, and are never a primary key — because
--      APNs are reassigned on lot splits/merges and are not unique across
--      county systems.
--   2. Money is decimal USD, never float. Monetary amounts are NUMERIC with an
--      explicit currency column; there is no DOUBLE PRECISION anywhere near a
--      dollar value. Lengths/areas persist as exact NUMERIC in canonical
--      kernel units (meters, square meters).

CREATE TABLE site (
    site_id            UUID        PRIMARY KEY,
    normalized_address TEXT,                       -- a locator, not a key
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attributed source-record identifiers. A site may carry several (splits/
-- merges); the same value under a different `system` is a different identifier.
CREATE TABLE site_external_identifier (
    site_id UUID NOT NULL REFERENCES site (site_id) ON DELETE CASCADE,
    system  TEXT NOT NULL,           -- e.g. 'hennepin-county-assessor', 'regrid'
    value   TEXT NOT NULL,           -- the identifier as the source expresses it
    kind    TEXT,                    -- e.g. 'APN', 'PID', 'FIPS'
    PRIMARY KEY (site_id, system, value)
);

-- Look up a site by an external identifier (source-record access, not the key).
CREATE INDEX site_external_identifier_lookup
    ON site_external_identifier (system, value);

-- Financial assumptions snapshot — the USD/decimal columns. Amounts are
-- NUMERIC(19, 4) (exact to the ten-thousandth of a dollar) with an explicit
-- currency; percentages are NUMERIC, never money. One snapshot per site keeps
-- the audit trail of what assumptions a pro forma ran on.
CREATE TABLE site_financial_assumption (
    site_id                UUID          PRIMARY KEY REFERENCES site (site_id) ON DELETE CASCADE,
    currency               CHAR(3)       NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    hard_cost_per_gsf      NUMERIC(19, 4),   -- USD per gross square foot
    soft_cost_pct          NUMERIC(7, 4),
    contingency_pct        NUMERIC(7, 4),
    construction_loan_rate NUMERIC(7, 4),
    permanent_loan_rate    NUMERIC(7, 4),
    exit_cap_rate          NUMERIC(7, 4),
    vacancy_pct            NUMERIC(7, 4),
    recorded_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);
