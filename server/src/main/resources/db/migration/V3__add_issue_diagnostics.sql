ALTER TABLE issues
    ADD COLUMN fingerprint_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER fingerprint,
    ADD COLUMN status_changed_at BIGINT UNSIGNED NULL AFTER status,
    ADD COLUMN resolved_at BIGINT UNSIGNED NULL AFTER status_changed_at,
    ADD COLUMN last_regressed_at BIGINT UNSIGNED NULL AFTER resolved_at,
    ADD COLUMN regression_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER last_regressed_at;

UPDATE issues
SET status_changed_at = updated_at,
    resolved_at = CASE WHEN status = 'resolved' THEN updated_at ELSE NULL END;

ALTER TABLE issues
    MODIFY COLUMN status_changed_at BIGINT UNSIGNED NOT NULL,
    DROP CHECK chk_issues_status,
    ADD CONSTRAINT chk_issues_status
        CHECK (status IN ('unresolved', 'resolving', 'resolved', 'ignored', 'regressed'));

CREATE TABLE issue_actors (
    issue_id BIGINT UNSIGNED NOT NULL,
    actor_key CHAR(64) NOT NULL,
    first_seen_at BIGINT UNSIGNED NOT NULL,
    last_seen_at BIGINT UNSIGNED NOT NULL,
    event_count BIGINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (issue_id, actor_key),
    CONSTRAINT fk_issue_actors_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO issue_actors (issue_id, actor_key, first_seen_at, last_seen_at, event_count)
SELECT issue_id,
       SHA2(CASE
                WHEN user_id IS NOT NULL AND user_id <> '' THEN CONCAT('user:', user_id)
                WHEN anonymous_id IS NOT NULL AND anonymous_id <> '' THEN CONCAT('anonymous:', anonymous_id)
                ELSE CONCAT('session:', session_id)
            END, 256),
       MIN(occurred_at),
       MAX(occurred_at),
       COUNT(*)
FROM events
WHERE type = 'error' AND issue_id IS NOT NULL
GROUP BY issue_id,
         SHA2(CASE
                  WHEN user_id IS NOT NULL AND user_id <> '' THEN CONCAT('user:', user_id)
                  WHEN anonymous_id IS NOT NULL AND anonymous_id <> '' THEN CONCAT('anonymous:', anonymous_id)
                  ELSE CONCAT('session:', session_id)
              END, 256);

UPDATE issues i
LEFT JOIN (
    SELECT issue_id, COUNT(*) AS actor_count
    FROM issue_actors
    GROUP BY issue_id
) actor_counts ON actor_counts.issue_id = i.id
SET i.affected_user_count = COALESCE(actor_counts.actor_count, 0);

CREATE TABLE issue_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    issue_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(20) NULL,
    to_status VARCHAR(20) NOT NULL,
    change_type VARCHAR(20) NOT NULL,
    reason VARCHAR(500) NULL,
    changed_by BIGINT UNSIGNED NULL,
    changed_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_issue_status_history_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_status_history_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_issue_history_from_status CHECK (
        from_status IS NULL OR from_status IN ('unresolved', 'resolving', 'resolved', 'ignored', 'regressed')
    ),
    CONSTRAINT chk_issue_history_to_status CHECK (
        to_status IN ('unresolved', 'resolving', 'resolved', 'ignored', 'regressed')
    ),
    CONSTRAINT chk_issue_history_change_type CHECK (change_type IN ('created', 'manual', 'regression', 'migration')),
    INDEX idx_issue_status_history_issue_time (issue_id, changed_at DESC, id DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO issue_status_history
    (issue_id, from_status, to_status, change_type, reason, changed_by, changed_at)
SELECT id, NULL, status, 'migration', 'V3 baseline', NULL, created_at
FROM issues;

-- Keep a temporary index while replacing the composite index used by the foreign key.
ALTER TABLE events ADD INDEX idx_events_issue_fk_v3 (issue_id);

ALTER TABLE events
    DROP INDEX idx_events_issue_occurred,
    DROP INDEX idx_events_app_release_occurred,
    DROP INDEX idx_events_app_user_occurred,
    ADD INDEX idx_events_issue_occurred (issue_id, occurred_at DESC, id DESC),
    ADD INDEX idx_events_app_environment_occurred (application_id, environment, occurred_at DESC, id DESC),
    ADD INDEX idx_events_app_release_occurred (application_id, release_name, occurred_at DESC, id DESC),
    ADD INDEX idx_events_app_user_occurred (application_id, user_id, occurred_at DESC, id DESC);

ALTER TABLE events DROP INDEX idx_events_issue_fk_v3;
