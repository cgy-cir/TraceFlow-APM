ALTER TABLE users
    ADD COLUMN created_at_ms BIGINT UNSIGNED NULL,
    ADD COLUMN updated_at_ms BIGINT UNSIGNED NULL;

UPDATE users
SET created_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', created_at) DIV 1000,
    updated_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', updated_at) DIV 1000;

ALTER TABLE users
    DROP COLUMN created_at,
    DROP COLUMN updated_at,
    CHANGE COLUMN created_at_ms created_at BIGINT UNSIGNED NOT NULL,
    CHANGE COLUMN updated_at_ms updated_at BIGINT UNSIGNED NOT NULL;

ALTER TABLE applications
    ADD COLUMN created_at_ms BIGINT UNSIGNED NULL,
    ADD COLUMN updated_at_ms BIGINT UNSIGNED NULL;

UPDATE applications
SET created_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', created_at) DIV 1000,
    updated_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', updated_at) DIV 1000;

ALTER TABLE applications
    DROP COLUMN created_at,
    DROP COLUMN updated_at,
    CHANGE COLUMN created_at_ms created_at BIGINT UNSIGNED NOT NULL,
    CHANGE COLUMN updated_at_ms updated_at BIGINT UNSIGNED NOT NULL;

ALTER TABLE issues
    DROP INDEX idx_issues_app_last_seen,
    DROP INDEX idx_issues_app_status_last_seen,
    ADD COLUMN first_seen_at_ms BIGINT UNSIGNED NULL,
    ADD COLUMN last_seen_at_ms BIGINT UNSIGNED NULL,
    ADD COLUMN created_at_ms BIGINT UNSIGNED NULL,
    ADD COLUMN updated_at_ms BIGINT UNSIGNED NULL;

UPDATE issues
SET first_seen_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', first_seen_at) DIV 1000,
    last_seen_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', last_seen_at) DIV 1000,
    created_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', created_at) DIV 1000,
    updated_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', updated_at) DIV 1000;

ALTER TABLE issues
    DROP COLUMN first_seen_at,
    DROP COLUMN last_seen_at,
    DROP COLUMN created_at,
    DROP COLUMN updated_at,
    CHANGE COLUMN first_seen_at_ms first_seen_at BIGINT UNSIGNED NOT NULL,
    CHANGE COLUMN last_seen_at_ms last_seen_at BIGINT UNSIGNED NOT NULL,
    CHANGE COLUMN created_at_ms created_at BIGINT UNSIGNED NOT NULL,
    CHANGE COLUMN updated_at_ms updated_at BIGINT UNSIGNED NOT NULL,
    ADD INDEX idx_issues_app_last_seen (application_id, last_seen_at DESC),
    ADD INDEX idx_issues_app_status_last_seen (application_id, status, last_seen_at DESC);

-- The existing composite issue index also backs the foreign key. Keep a temporary
-- single-column index while the occurred_at column and its indexes are replaced.
ALTER TABLE events ADD INDEX idx_events_issue_fk (issue_id);

ALTER TABLE events
    DROP INDEX idx_events_app_type_occurred,
    DROP INDEX idx_events_issue_occurred,
    DROP INDEX idx_events_app_release_occurred,
    DROP INDEX idx_events_app_user_occurred,
    DROP INDEX idx_events_app_http_status_occurred,
    ADD COLUMN occurred_at_ms BIGINT UNSIGNED NULL,
    ADD COLUMN received_at_ms BIGINT UNSIGNED NULL,
    ADD COLUMN created_at_ms BIGINT UNSIGNED NULL;

UPDATE events
SET occurred_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', occurred_at) DIV 1000,
    received_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', received_at) DIV 1000,
    created_at_ms = TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00.000', created_at) DIV 1000;

ALTER TABLE events
    DROP COLUMN occurred_at,
    DROP COLUMN received_at,
    DROP COLUMN created_at,
    CHANGE COLUMN occurred_at_ms occurred_at BIGINT UNSIGNED NOT NULL,
    CHANGE COLUMN received_at_ms received_at BIGINT UNSIGNED NOT NULL,
    CHANGE COLUMN created_at_ms created_at BIGINT UNSIGNED NOT NULL,
    ADD INDEX idx_events_app_type_occurred (application_id, type, occurred_at DESC),
    ADD INDEX idx_events_issue_occurred (issue_id, occurred_at DESC),
    ADD INDEX idx_events_app_release_occurred (application_id, release_name, occurred_at DESC),
    ADD INDEX idx_events_app_user_occurred (application_id, user_id, occurred_at DESC),
    ADD INDEX idx_events_app_http_status_occurred (application_id, http_status, occurred_at DESC);

ALTER TABLE events DROP INDEX idx_events_issue_fk;
