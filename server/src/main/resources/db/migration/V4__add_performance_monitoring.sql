ALTER TABLE events
    ADD COLUMN performance_kind VARCHAR(20) NULL AFTER http_outcome,
    ADD COLUMN metric_name VARCHAR(40) NULL AFTER performance_kind,
    ADD COLUMN measurement_id VARCHAR(100) NULL AFTER metric_name,
    ADD COLUMN metric_value DECIMAL(16, 4) NULL AFTER measurement_id,
    ADD COLUMN metric_unit VARCHAR(10) NULL AFTER metric_value,
    ADD COLUMN metric_rating VARCHAR(24) NULL AFTER metric_unit,
    ADD COLUMN resource_url VARCHAR(2048) NULL AFTER metric_rating,
    ADD COLUMN resource_type VARCHAR(40) NULL AFTER resource_url,
    ADD COLUMN resource_duration_ms DECIMAL(12, 3) NULL AFTER resource_type,
    DROP CHECK chk_events_type,
    ADD CONSTRAINT chk_events_type
        CHECK (type IN ('page_view', 'error', 'http', 'performance', 'resource')),
    ADD CONSTRAINT chk_events_performance_fields CHECK (
        (type = 'performance' AND (
            (performance_kind = 'web_vital'
                AND metric_name IN ('LCP', 'CLS', 'INP', 'FCP', 'TTFB')
                AND measurement_id IS NOT NULL
                AND metric_value IS NOT NULL
                AND metric_value >= 0
                AND metric_unit IN ('ms', 'score')
                AND metric_rating IN ('good', 'needs-improvement', 'poor'))
            OR
            (performance_kind = 'navigation'
                AND metric_name IS NULL
                AND measurement_id IS NULL
                AND metric_value IS NULL
                AND metric_unit IS NULL
                AND metric_rating IS NULL)
        ))
        OR
        (type <> 'performance'
            AND performance_kind IS NULL
            AND metric_name IS NULL
            AND measurement_id IS NULL
            AND metric_value IS NULL
            AND metric_unit IS NULL
            AND metric_rating IS NULL)
    ),
    ADD CONSTRAINT chk_events_metric_unit CHECK (
        metric_name IS NULL
        OR (metric_name = 'CLS' AND metric_unit = 'score')
        OR (metric_name IN ('LCP', 'INP', 'FCP', 'TTFB') AND metric_unit = 'ms')
    ),
    ADD CONSTRAINT chk_events_resource_fields CHECK (
        (type = 'resource'
            AND resource_url IS NOT NULL
            AND resource_type IS NOT NULL
            AND resource_duration_ms IS NOT NULL
            AND resource_duration_ms >= 0)
        OR
        (type <> 'resource'
            AND resource_url IS NULL
            AND resource_type IS NULL
            AND resource_duration_ms IS NULL)
    ),
    ADD CONSTRAINT uk_events_app_metric_measurement
        UNIQUE (application_id, metric_name, measurement_id),
    ADD INDEX idx_events_app_metric_occurred
        (application_id, metric_name, occurred_at DESC, id DESC),
    ADD INDEX idx_events_app_resource_duration
        (application_id, resource_duration_ms DESC, occurred_at DESC, id DESC);

ALTER TABLE events
    DROP INDEX idx_events_app_type_occurred,
    ADD INDEX idx_events_app_type_occurred
        (application_id, type, occurred_at DESC, id DESC);

CREATE TABLE performance_metric_buckets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    application_id BIGINT UNSIGNED NOT NULL,
    bucket_start BIGINT UNSIGNED NOT NULL,
    granularity VARCHAR(10) NOT NULL DEFAULT 'hour',
    metric_name VARCHAR(40) NOT NULL,
    metric_unit VARCHAR(10) NOT NULL,
    dimension_hash CHAR(64) NOT NULL,
    dimensions JSON NOT NULL,
    sample_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    metric_sum DECIMAL(30, 4) NOT NULL DEFAULT 0,
    metric_min DECIMAL(16, 4) NOT NULL,
    metric_max DECIMAL(16, 4) NOT NULL,
    good_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    needs_improvement_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    poor_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    histogram_kind VARCHAR(24) NOT NULL,
    bucket_00 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_01 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_02 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_03 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_04 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_05 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_06 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_07 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_08 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_09 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_10 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_11 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_12 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_13 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_14 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    bucket_15 BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at BIGINT UNSIGNED NOT NULL,
    updated_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_perf_bucket_identity UNIQUE (
        application_id,
        bucket_start,
        granularity,
        metric_name,
        dimension_hash
    ),
    CONSTRAINT fk_perf_bucket_application
        FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
    CONSTRAINT chk_perf_bucket_granularity CHECK (granularity = 'hour'),
    CONSTRAINT chk_perf_bucket_unit CHECK (metric_unit IN ('ms', 'score', 'bytes')),
    CONSTRAINT chk_perf_bucket_histogram CHECK (
        histogram_kind IN ('TIMING_MS_V1', 'CLS_SCORE_V1', 'SIZE_BYTES_V1')
    ),
    CONSTRAINT chk_perf_bucket_values CHECK (
        sample_count > 0
        AND metric_sum >= 0
        AND metric_min >= 0
        AND metric_max >= metric_min
        AND good_count + needs_improvement_count + poor_count <= sample_count
    ),
    INDEX idx_perf_bucket_app_metric_time (application_id, metric_name, bucket_start),
    INDEX idx_perf_bucket_app_time (application_id, bucket_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE metric_aggregation_checkpoints (
    application_id BIGINT UNSIGNED NOT NULL,
    last_event_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (application_id),
    CONSTRAINT fk_metric_checkpoint_application
        FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO metric_aggregation_checkpoints (application_id, last_event_id, updated_at)
SELECT applications.id,
       COALESCE(MAX(events.id), 0),
       CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED)
FROM applications
LEFT JOIN events ON events.application_id = applications.id
GROUP BY applications.id;
