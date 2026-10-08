package io.traceflow.performance;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

public interface PerformanceQueryMapper {
    @Select("""
            <script>
            SELECT bucket_start, metric_name, metric_unit, dimensions, sample_count, metric_sum,
                   metric_min, metric_max, good_count, needs_improvement_count, poor_count, histogram_kind,
                   bucket_00, bucket_01, bucket_02, bucket_03, bucket_04, bucket_05, bucket_06, bucket_07,
                   bucket_08, bucket_09, bucket_10, bucket_11, bucket_12, bucket_13, bucket_14, bucket_15
            FROM performance_metric_buckets
            WHERE application_id = #{applicationId}
              AND granularity = 'hour'
              AND bucket_start &gt;= #{fromBucket}
              AND bucket_start &lt;= #{toBucket}
            <if test="metrics != null and !metrics.isEmpty()">
              AND metric_name IN
              <foreach collection="metrics" item="metric" open="(" separator="," close=")">#{metric}</foreach>
            </if>
            ORDER BY bucket_start, metric_name
            </script>
            """)
    List<PerformanceBucketRow> findBuckets(@Param("applicationId") long applicationId,
                                           @Param("fromBucket") long fromBucket,
                                           @Param("toBucket") long toBucket,
                                           @Param("metrics") List<String> metrics);

    @Select("""
            <script>
            SELECT id, event_id, occurred_at, environment, release_name, page_url, page_path,
                   resource_url, resource_type, resource_duration_ms, payload, context
            FROM events
            WHERE application_id = #{applicationId}
              AND type = 'resource'
              AND occurred_at &gt;= #{fromTime}
              AND occurred_at &lt;= #{toTime}
            <if test="environment != null and environment != ''">AND environment = #{environment}</if>
            <if test="release != null and release != ''">AND release_name = #{release}</if>
            <if test="pagePath != null and pagePath != ''">AND page_path = #{pagePath}</if>
            <if test="deviceType != null and deviceType != ''">
              AND CASE
                WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), ''))
                         REGEXP 'ipad|tablet'
                  OR (LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), '')) LIKE '%android%'
                      AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), '')) NOT LIKE '%mobile%')
                  THEN 'tablet'
                WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), ''))
                         REGEXP 'mobi|iphone|android' THEN 'mobile'
                WHEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), '') != '' THEN 'desktop'
                WHEN JSON_EXTRACT(context, '$.device.viewportWidth') IS NULL
                  OR JSON_TYPE(JSON_EXTRACT(context, '$.device.viewportWidth')) = 'NULL' THEN 'unknown'
                WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.viewportWidth')) AS UNSIGNED) &lt;= 767 THEN 'mobile'
                WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.viewportWidth')) AS UNSIGNED) &lt;= 1024 THEN 'tablet'
                ELSE 'desktop'
              END = #{deviceType}
            </if>
            ORDER BY resource_duration_ms DESC, occurred_at DESC, id DESC
            LIMIT #{limit}
            </script>
            """)
    List<ResourceEventRow> findSlowResources(@Param("applicationId") long applicationId,
                                             @Param("fromTime") long fromTime,
                                             @Param("toTime") long toTime,
                                             @Param("environment") String environment,
                                             @Param("release") String release,
                                             @Param("pagePath") String pagePath,
                                             @Param("deviceType") String deviceType,
                                             @Param("limit") int limit);

    @Select("""
            <script>
            SELECT COUNT(*)
            FROM events
            WHERE application_id = #{applicationId}
              AND type = #{type}
              AND occurred_at &gt;= #{fromTime}
              AND occurred_at &lt;= #{toTime}
            <if test="outcome != null and outcome != ''">AND http_outcome = #{outcome}</if>
            <if test="environment != null and environment != ''">AND environment = #{environment}</if>
            <if test="release != null and release != ''">AND release_name = #{release}</if>
            <if test="pagePath != null and pagePath != ''">AND page_path = #{pagePath}</if>
            <if test="deviceType != null and deviceType != ''">
              AND CASE
                WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), ''))
                         REGEXP 'ipad|tablet'
                  OR (LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), '')) LIKE '%android%'
                      AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), '')) NOT LIKE '%mobile%')
                  THEN 'tablet'
                WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), ''))
                         REGEXP 'mobi|iphone|android' THEN 'mobile'
                WHEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.userAgent')), '') != '' THEN 'desktop'
                WHEN JSON_EXTRACT(context, '$.device.viewportWidth') IS NULL
                  OR JSON_TYPE(JSON_EXTRACT(context, '$.device.viewportWidth')) = 'NULL' THEN 'unknown'
                WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.viewportWidth')) AS UNSIGNED) &lt;= 767 THEN 'mobile'
                WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(context, '$.device.viewportWidth')) AS UNSIGNED) &lt;= 1024 THEN 'tablet'
                ELSE 'desktop'
              END = #{deviceType}
            </if>
            </script>
            """)
    long countEvents(@Param("applicationId") long applicationId,
                     @Param("type") String type,
                     @Param("outcome") String outcome,
                     @Param("fromTime") long fromTime,
                     @Param("toTime") long toTime,
                     @Param("environment") String environment,
                     @Param("release") String release,
                     @Param("pagePath") String pagePath,
                     @Param("deviceType") String deviceType);
}
