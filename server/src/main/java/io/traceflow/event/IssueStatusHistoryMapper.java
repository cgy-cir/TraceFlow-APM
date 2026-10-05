package io.traceflow.event;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

public interface IssueStatusHistoryMapper {
    @Insert("""
            INSERT INTO issue_status_history
                (issue_id, from_status, to_status, change_type, reason, changed_by, changed_at)
            VALUES
                (#{issueId}, #{fromStatus}, #{toStatus}, #{changeType}, #{reason}, #{changedBy}, #{changedAt})
            """)
    int insert(@Param("issueId") long issueId, @Param("fromStatus") String fromStatus,
               @Param("toStatus") String toStatus, @Param("changeType") String changeType,
               @Param("reason") String reason, @Param("changedBy") Long changedBy,
               @Param("changedAt") long changedAt);

    @Select("""
            SELECT id, issue_id, from_status, to_status, change_type, reason, changed_by, changed_at
            FROM issue_status_history
            WHERE issue_id = #{issueId}
            ORDER BY changed_at DESC, id DESC
            """)
    List<StatusHistoryRow> findByIssueId(@Param("issueId") long issueId);

    record StatusHistoryRow(Long id, Long issueId, String fromStatus, String toStatus, String changeType,
                            String reason, Long changedBy, Long changedAt) {
    }
}
