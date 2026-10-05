package io.traceflow.event;

import io.traceflow.event.IssueMapper.IssueRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Set;

@Service
public class IssueService {
    private static final Map<String, Set<String>> TRANSITIONS = Map.of(
            "unresolved", Set.of("resolving", "resolved", "ignored"),
            "resolving", Set.of("unresolved", "resolved", "ignored"),
            "resolved", Set.of("unresolved", "ignored"),
            "ignored", Set.of("unresolved"),
            "regressed", Set.of("resolving", "resolved", "ignored")
    );

    private final IssueMapper issueMapper;
    private final IssueStatusHistoryMapper statusHistoryMapper;

    public IssueService(IssueMapper issueMapper, IssueStatusHistoryMapper statusHistoryMapper) {
        this.issueMapper = issueMapper;
        this.statusHistoryMapper = statusHistoryMapper;
    }

    public IssueRow requireIssue(long applicationId, long issueId) {
        IssueRow issue = issueMapper.findById(applicationId, issueId);
        if (issue == null) throw new EventApiException(404, "ISSUE_NOT_FOUND", "issue does not exist");
        return issue;
    }

    @Transactional
    public IssueRow updateStatus(long applicationId, long issueId, String nextStatus, String reason) {
        IssueRow current = requireIssue(applicationId, issueId);
        if ("regressed".equals(nextStatus) || !TRANSITIONS.getOrDefault(current.status(), Set.of()).contains(nextStatus)) {
            throw new EventApiException(409, "ISSUE_STATUS_CONFLICT",
                    "issue cannot move from " + current.status() + " to " + nextStatus);
        }
        long changedAt = System.currentTimeMillis();
        if (issueMapper.updateStatus(applicationId, issueId, current.status(), nextStatus, changedAt) != 1) {
            throw new EventApiException(409, "ISSUE_STATUS_CONFLICT", "issue status changed concurrently");
        }
        statusHistoryMapper.insert(issueId, current.status(), nextStatus, "manual", reason, null, changedAt);
        return requireIssue(applicationId, issueId);
    }
}
