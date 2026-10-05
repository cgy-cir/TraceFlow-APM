package io.traceflow.event;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface EventMapper {
    @Insert("""
            INSERT IGNORE INTO events (
                event_id, application_id, issue_id, schema_version, type, occurred_at, received_at,
                environment, release_name, session_id, anonymous_id, user_id, trace_id, page_url, page_path,
                error_name, error_message, http_method, http_url, http_status, http_duration_ms, http_outcome,
                payload, context, breadcrumbs, created_at
            ) VALUES (
                #{eventId}, #{applicationId}, #{issueId}, #{schemaVersion}, #{type}, #{occurredAt}, #{receivedAt},
                #{environment}, #{releaseName}, #{sessionId}, #{anonymousId}, #{userId}, #{traceId}, #{pageUrl}, #{pagePath},
                #{errorName}, #{errorMessage}, #{httpMethod}, #{httpUrl}, #{httpStatus}, #{httpDurationMs}, #{httpOutcome},
                #{payload}, #{context}, #{breadcrumbs}, #{createdAt}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertIgnore(EventEntity event);

    @Update("UPDATE events SET issue_id = #{issueId} WHERE id = #{eventId}")
    int attachIssue(@Param("eventId") long eventId, @Param("issueId") long issueId);

    @Select("""
            <script>
            SELECT id, event_id, application_id, occurred_at, environment, release_name, page_url, page_path,
                   http_method, http_url, http_status, http_duration_ms, http_outcome
            FROM events
            WHERE application_id = #{applicationId} AND type = 'http'
            <if test="outcome != null and outcome != ''">AND http_outcome = #{outcome}</if>
            ORDER BY occurred_at DESC
            LIMIT #{limit} OFFSET #{offset}
            </script>
            """)
    List<EventEntity> findHttpEvents(@Param("applicationId") long applicationId,
                                     @Param("outcome") String outcome,
                                     @Param("limit") int limit,
                                     @Param("offset") int offset);

    @Select("""
            <script>
            SELECT COUNT(*) FROM events
            WHERE application_id = #{applicationId} AND type = 'http'
            <if test="outcome != null and outcome != ''">AND http_outcome = #{outcome}</if>
            </script>
            """)
    long countHttpEvents(@Param("applicationId") long applicationId, @Param("outcome") String outcome);

    @Select("""
            <script>
            SELECT id, event_id, application_id, issue_id, schema_version, type, occurred_at, received_at,
                   environment, release_name, session_id, anonymous_id, user_id, trace_id, page_url, page_path,
                   error_name, error_message, payload, context, breadcrumbs, created_at
            FROM events
            WHERE application_id = #{applicationId} AND issue_id = #{issueId} AND type = 'error'
            <if test="environment != null and environment != ''">AND environment = #{environment}</if>
            <if test="release != null and release != ''">AND release_name = #{release}</if>
            <if test="userId != null and userId != ''">AND user_id = #{userId}</if>
            <if test="fromTime != null">AND occurred_at &gt;= #{fromTime}</if>
            <if test="toTime != null">AND occurred_at &lt;= #{toTime}</if>
            ORDER BY occurred_at DESC, id DESC
            LIMIT #{limit} OFFSET #{offset}
            </script>
            """)
    List<EventEntity> findIssueEvents(@Param("applicationId") long applicationId,
                                      @Param("issueId") long issueId,
                                      @Param("environment") String environment,
                                      @Param("release") String release,
                                      @Param("userId") String userId,
                                      @Param("fromTime") Long fromTime,
                                      @Param("toTime") Long toTime,
                                      @Param("limit") int limit,
                                      @Param("offset") int offset);

    @Select("""
            <script>
            SELECT COUNT(*) FROM events
            WHERE application_id = #{applicationId} AND issue_id = #{issueId} AND type = 'error'
            <if test="environment != null and environment != ''">AND environment = #{environment}</if>
            <if test="release != null and release != ''">AND release_name = #{release}</if>
            <if test="userId != null and userId != ''">AND user_id = #{userId}</if>
            <if test="fromTime != null">AND occurred_at &gt;= #{fromTime}</if>
            <if test="toTime != null">AND occurred_at &lt;= #{toTime}</if>
            </script>
            """)
    long countIssueEvents(@Param("applicationId") long applicationId,
                          @Param("issueId") long issueId,
                          @Param("environment") String environment,
                          @Param("release") String release,
                          @Param("userId") String userId,
                          @Param("fromTime") Long fromTime,
                          @Param("toTime") Long toTime);

    @Select("""
            SELECT id, event_id, application_id, issue_id, schema_version, type, occurred_at, received_at,
                   environment, release_name, session_id, anonymous_id, user_id, trace_id, page_url, page_path,
                   error_name, error_message, payload, context, breadcrumbs, created_at
            FROM events
            WHERE id = #{eventId} AND application_id = #{applicationId}
            """)
    EventEntity findById(@Param("applicationId") long applicationId, @Param("eventId") long eventId);
}
