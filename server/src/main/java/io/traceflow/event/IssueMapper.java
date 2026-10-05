package io.traceflow.event;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface IssueMapper {
    @Insert("""
            INSERT INTO issues (
                application_id, fingerprint, fingerprint_version, title, error_type, status, status_changed_at,
                level, first_seen_at, last_seen_at, event_count, affected_user_count, created_at, updated_at
            ) VALUES (
                #{applicationId}, #{fingerprint}, #{fingerprintVersion}, #{title}, #{errorType}, 'unresolved',
                #{statusChangedAt}, 'error', #{firstSeenAt}, #{lastSeenAt}, 1, 0, #{createdAt}, #{updatedAt}
            )
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                first_seen_at = LEAST(first_seen_at, VALUES(first_seen_at)),
                last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at)),
                event_count = event_count + 1,
                updated_at = VALUES(updated_at)
            """)
    int upsert(IssueEntity issue);

    @Select("SELECT id FROM issues WHERE application_id = #{applicationId} AND fingerprint = #{fingerprint}")
    Long findId(@Param("applicationId") long applicationId, @Param("fingerprint") String fingerprint);

    @Update("""
            UPDATE issues
            SET latest_event_id = #{eventId}
            WHERE id = #{issueId}
              AND (latest_event_id IS NULL
                OR #{occurredAt} > (SELECT occurred_at FROM events WHERE id = latest_event_id)
                OR (#{occurredAt} = (SELECT occurred_at FROM events WHERE id = latest_event_id)
                    AND #{eventId} > latest_event_id))
            """)
    int updateLatestEvent(@Param("issueId") long issueId, @Param("eventId") long eventId,
                          @Param("occurredAt") long occurredAt);

    @Update("UPDATE issues SET affected_user_count = affected_user_count + 1 WHERE id = #{issueId}")
    int incrementAffectedUserCount(@Param("issueId") long issueId);

    @Update("""
            UPDATE issues
            SET status = 'regressed', status_changed_at = #{changedAt}, last_regressed_at = #{changedAt},
                regression_count = regression_count + 1, updated_at = #{changedAt}
            WHERE id = #{issueId} AND status = 'resolved'
            """)
    int markRegressed(@Param("issueId") long issueId, @Param("changedAt") long changedAt);

    @Select("""
            <script>
            SELECT i.id, i.application_id, i.fingerprint, i.fingerprint_version, i.title, i.error_type,
                   i.status, i.level, i.status_changed_at, i.resolved_at, i.last_regressed_at,
                   i.regression_count, i.first_seen_at, i.last_seen_at, i.event_count,
                   i.affected_user_count, i.latest_event_id
            FROM issues i
            WHERE i.application_id = #{applicationId}
            <if test="status != null and status != ''">AND i.status = #{status}</if>
            <if test="query != null and query != ''">
                AND (i.title LIKE CONCAT('%', #{query}, '%') OR i.error_type LIKE CONCAT('%', #{query}, '%'))
            </if>
            <if test="environment != null or release != null or userId != null or fromTime != null or toTime != null">
                AND EXISTS (
                    SELECT 1 FROM events e
                    WHERE e.issue_id = i.id
                    <if test="environment != null and environment != ''">AND e.environment = #{environment}</if>
                    <if test="release != null and release != ''">AND e.release_name = #{release}</if>
                    <if test="userId != null and userId != ''">AND e.user_id = #{userId}</if>
                    <if test="fromTime != null">AND e.occurred_at &gt;= #{fromTime}</if>
                    <if test="toTime != null">AND e.occurred_at &lt;= #{toTime}</if>
                )
            </if>
            ORDER BY
            <choose>
                <when test="sort == 'firstSeen'">i.first_seen_at DESC</when>
                <when test="sort == 'events'">i.event_count DESC, i.last_seen_at DESC</when>
                <otherwise>i.last_seen_at DESC</otherwise>
            </choose>, i.id DESC
            LIMIT #{limit} OFFSET #{offset}
            </script>
            """)
    List<IssueRow> findIssues(@Param("applicationId") long applicationId, @Param("status") String status,
                              @Param("environment") String environment, @Param("release") String release,
                              @Param("userId") String userId, @Param("fromTime") Long fromTime,
                              @Param("toTime") Long toTime, @Param("query") String query,
                              @Param("sort") String sort, @Param("limit") int limit, @Param("offset") int offset);

    @Select("""
            <script>
            SELECT COUNT(*) FROM issues i
            WHERE i.application_id = #{applicationId}
            <if test="status != null and status != ''">AND i.status = #{status}</if>
            <if test="query != null and query != ''">
                AND (i.title LIKE CONCAT('%', #{query}, '%') OR i.error_type LIKE CONCAT('%', #{query}, '%'))
            </if>
            <if test="environment != null or release != null or userId != null or fromTime != null or toTime != null">
                AND EXISTS (
                    SELECT 1 FROM events e
                    WHERE e.issue_id = i.id
                    <if test="environment != null and environment != ''">AND e.environment = #{environment}</if>
                    <if test="release != null and release != ''">AND e.release_name = #{release}</if>
                    <if test="userId != null and userId != ''">AND e.user_id = #{userId}</if>
                    <if test="fromTime != null">AND e.occurred_at &gt;= #{fromTime}</if>
                    <if test="toTime != null">AND e.occurred_at &lt;= #{toTime}</if>
                )
            </if>
            </script>
            """)
    long countIssues(@Param("applicationId") long applicationId, @Param("status") String status,
                     @Param("environment") String environment, @Param("release") String release,
                     @Param("userId") String userId, @Param("fromTime") Long fromTime,
                     @Param("toTime") Long toTime, @Param("query") String query);

    @Select("""
            SELECT id, application_id, fingerprint, fingerprint_version, title, error_type, status, level,
                   status_changed_at, resolved_at, last_regressed_at, regression_count, first_seen_at, last_seen_at,
                   event_count, affected_user_count, latest_event_id
            FROM issues
            WHERE id = #{issueId} AND application_id = #{applicationId}
            """)
    IssueRow findById(@Param("applicationId") long applicationId, @Param("issueId") long issueId);

    @Update("""
            UPDATE issues
            SET status = #{nextStatus}, status_changed_at = #{changedAt},
                resolved_at = CASE WHEN #{nextStatus} = 'resolved' THEN #{changedAt} ELSE resolved_at END,
                updated_at = #{changedAt}
            WHERE id = #{issueId} AND application_id = #{applicationId} AND status = #{expectedStatus}
            """)
    int updateStatus(@Param("applicationId") long applicationId, @Param("issueId") long issueId,
                     @Param("expectedStatus") String expectedStatus, @Param("nextStatus") String nextStatus,
                     @Param("changedAt") long changedAt);

    record IssueRow(Long id, Long applicationId, String fingerprint, Integer fingerprintVersion,
                    String title, String errorType, String status, String level, Long statusChangedAt,
                    Long resolvedAt, Long lastRegressedAt, long regressionCount, Long firstSeenAt, Long lastSeenAt,
                    long eventCount, long affectedUserCount, Long latestEventId) {
    }
}
