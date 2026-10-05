package io.traceflow.event;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface IssueActorMapper {
    @Insert("""
            INSERT IGNORE INTO issue_actors (issue_id, actor_key, first_seen_at, last_seen_at, event_count)
            VALUES (#{issueId}, #{actorKey}, #{occurredAt}, #{occurredAt}, 1)
            """)
    int insertIgnore(@Param("issueId") long issueId, @Param("actorKey") String actorKey,
                     @Param("occurredAt") long occurredAt);

    @Update("""
            UPDATE issue_actors
            SET first_seen_at = LEAST(first_seen_at, #{occurredAt}),
                last_seen_at = GREATEST(last_seen_at, #{occurredAt}),
                event_count = event_count + 1
            WHERE issue_id = #{issueId} AND actor_key = #{actorKey}
            """)
    int updateSeen(@Param("issueId") long issueId, @Param("actorKey") String actorKey,
                   @Param("occurredAt") long occurredAt);
}
