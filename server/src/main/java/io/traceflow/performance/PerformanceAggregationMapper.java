package io.traceflow.performance;

import io.traceflow.event.EventEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface PerformanceAggregationMapper {
    @Select("SELECT id FROM applications WHERE status = 'active' ORDER BY id")
    List<Long> findActiveApplicationIds();

    @Insert("""
            INSERT IGNORE INTO metric_aggregation_checkpoints (application_id, last_event_id, updated_at)
            VALUES (#{applicationId}, 0, #{now})
            """)
    int insertCheckpointIfMissing(@Param("applicationId") long applicationId, @Param("now") long now);

    @Select("""
            SELECT last_event_id
            FROM metric_aggregation_checkpoints
            WHERE application_id = #{applicationId}
            FOR UPDATE
            """)
    Long lockCheckpoint(@Param("applicationId") long applicationId);

    @Select("""
            SELECT id, type, occurred_at, environment, release_name, page_path, context, payload,
                   performance_kind, metric_name, metric_value, metric_unit, metric_rating,
                   resource_type, resource_duration_ms
            FROM events
            WHERE application_id = #{applicationId} AND id > #{lastEventId}
            ORDER BY id
            LIMIT #{limit}
            """)
    List<EventEntity> findEventsAfter(@Param("applicationId") long applicationId,
                                      @Param("lastEventId") long lastEventId,
                                      @Param("limit") int limit);

    @Insert("""
            INSERT INTO performance_metric_buckets (
                application_id, bucket_start, granularity, metric_name, metric_unit,
                dimension_hash, dimensions, sample_count, metric_sum, metric_min, metric_max,
                good_count, needs_improvement_count, poor_count, histogram_kind,
                bucket_00, bucket_01, bucket_02, bucket_03, bucket_04, bucket_05, bucket_06, bucket_07,
                bucket_08, bucket_09, bucket_10, bucket_11, bucket_12, bucket_13, bucket_14, bucket_15,
                created_at, updated_at
            ) VALUES (
                #{applicationId}, #{bucketStart}, 'hour', #{metricName}, #{metricUnit},
                #{dimensionHash}, #{dimensions}, #{sampleCount}, #{metricSum}, #{metricMin}, #{metricMax},
                #{goodCount}, #{needsImprovementCount}, #{poorCount}, #{histogramKind},
                #{bucket00}, #{bucket01}, #{bucket02}, #{bucket03}, #{bucket04}, #{bucket05}, #{bucket06}, #{bucket07},
                #{bucket08}, #{bucket09}, #{bucket10}, #{bucket11}, #{bucket12}, #{bucket13}, #{bucket14}, #{bucket15},
                #{now}, #{now}
            ) AS incoming
            ON DUPLICATE KEY UPDATE
                sample_count = performance_metric_buckets.sample_count + incoming.sample_count,
                metric_sum = performance_metric_buckets.metric_sum + incoming.metric_sum,
                metric_min = LEAST(performance_metric_buckets.metric_min, incoming.metric_min),
                metric_max = GREATEST(performance_metric_buckets.metric_max, incoming.metric_max),
                good_count = performance_metric_buckets.good_count + incoming.good_count,
                needs_improvement_count = performance_metric_buckets.needs_improvement_count + incoming.needs_improvement_count,
                poor_count = performance_metric_buckets.poor_count + incoming.poor_count,
                bucket_00 = performance_metric_buckets.bucket_00 + incoming.bucket_00,
                bucket_01 = performance_metric_buckets.bucket_01 + incoming.bucket_01,
                bucket_02 = performance_metric_buckets.bucket_02 + incoming.bucket_02,
                bucket_03 = performance_metric_buckets.bucket_03 + incoming.bucket_03,
                bucket_04 = performance_metric_buckets.bucket_04 + incoming.bucket_04,
                bucket_05 = performance_metric_buckets.bucket_05 + incoming.bucket_05,
                bucket_06 = performance_metric_buckets.bucket_06 + incoming.bucket_06,
                bucket_07 = performance_metric_buckets.bucket_07 + incoming.bucket_07,
                bucket_08 = performance_metric_buckets.bucket_08 + incoming.bucket_08,
                bucket_09 = performance_metric_buckets.bucket_09 + incoming.bucket_09,
                bucket_10 = performance_metric_buckets.bucket_10 + incoming.bucket_10,
                bucket_11 = performance_metric_buckets.bucket_11 + incoming.bucket_11,
                bucket_12 = performance_metric_buckets.bucket_12 + incoming.bucket_12,
                bucket_13 = performance_metric_buckets.bucket_13 + incoming.bucket_13,
                bucket_14 = performance_metric_buckets.bucket_14 + incoming.bucket_14,
                bucket_15 = performance_metric_buckets.bucket_15 + incoming.bucket_15,
                updated_at = incoming.updated_at
            """)
    int upsertBucket(PerformanceMetricBucketDelta delta);

    @Update("""
            UPDATE metric_aggregation_checkpoints
            SET last_event_id = #{lastEventId}, updated_at = #{now}
            WHERE application_id = #{applicationId}
            """)
    int updateCheckpoint(@Param("applicationId") long applicationId,
                         @Param("lastEventId") long lastEventId,
                         @Param("now") long now);
}
