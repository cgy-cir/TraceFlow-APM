package io.traceflow.event;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface IssueMapper {
    @Insert("""
            INSERT INTO issues (
                application_id, fingerprint, title, error_type, status, level, first_seen_at, last_seen_at,
                event_count, affected_user_count, created_at, updated_at
            ) VALUES (
                #{applicationId}, #{fingerprint}, #{title}, #{errorType}, 'unresolved', 'error',
                #{firstSeenAt}, #{lastSeenAt}, 1, #{affectedUserCount}, #{createdAt}, #{updatedAt}
            )
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at)),
                event_count = event_count + 1,
                affected_user_count = affected_user_count + VALUES(affected_user_count),
                updated_at = VALUES(updated_at)
            """)
    int upsert(IssueEntity issue);

    @Select("SELECT id FROM issues WHERE application_id = #{applicationId} AND fingerprint = #{fingerprint}")
    Long findId(@Param("applicationId") long applicationId, @Param("fingerprint") String fingerprint);

    @Update("UPDATE issues SET latest_event_id = #{eventId} WHERE id = #{issueId}")
    int updateLatestEvent(@Param("issueId") long issueId, @Param("eventId") long eventId);

    @Select("""
            <script>
            SELECT id, application_id, fingerprint, title, error_type, status, level, first_seen_at, last_seen_at,
                   event_count, affected_user_count, latest_event_id
            FROM issues
            WHERE application_id = #{applicationId}
            <if test="status != null and status != ''">AND status = #{status}</if>
            ORDER BY last_seen_at DESC
            LIMIT #{limit} OFFSET #{offset}
            </script>
            """)
    List<IssueRow> findIssues(@Param("applicationId") long applicationId,
                              @Param("status") String status,
                              @Param("limit") int limit,
                              @Param("offset") int offset);

    @Select("""
            <script>
            SELECT COUNT(*) FROM issues
            WHERE application_id = #{applicationId}
            <if test="status != null and status != ''">AND status = #{status}</if>
            </script>
            """)
    long countIssues(@Param("applicationId") long applicationId, @Param("status") String status);

    record IssueRow(Long id, Long applicationId, String fingerprint, String title, String errorType,
                    String status, String level, Long firstSeenAt, Long lastSeenAt,
                    long eventCount, long affectedUserCount, Long latestEventId) {
    }
}
