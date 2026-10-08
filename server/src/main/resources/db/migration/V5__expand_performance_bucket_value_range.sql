ALTER TABLE performance_metric_buckets
    MODIFY COLUMN metric_min DECIMAL(24, 4) NOT NULL,
    MODIFY COLUMN metric_max DECIMAL(24, 4) NOT NULL;
