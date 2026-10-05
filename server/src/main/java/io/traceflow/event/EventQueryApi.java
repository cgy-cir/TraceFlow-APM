package io.traceflow.event;

import io.traceflow.event.IssueMapper.IssueRow;
import io.traceflow.event.IssueStatusHistoryMapper.StatusHistoryRow;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

@RestController
public class EventQueryApi {
    private static final Set<String> ISSUE_STATUSES = Set.of(
            "unresolved", "resolving", "resolved", "ignored", "regressed");
    private static final Set<String> ISSUE_SORTS = Set.of("lastSeen", "firstSeen", "events");

    private final IssueMapper issueMapper;
    private final EventMapper eventMapper;
    private final IssueStatusHistoryMapper statusHistoryMapper;
    private final IssueService issueService;
    private final ObjectMapper objectMapper;

    public EventQueryApi(IssueMapper issueMapper, EventMapper eventMapper,
                         IssueStatusHistoryMapper statusHistoryMapper, IssueService issueService,
                         ObjectMapper objectMapper) {
        this.issueMapper = issueMapper;
        this.eventMapper = eventMapper;
        this.statusHistoryMapper = statusHistoryMapper;
        this.issueService = issueService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/api/v1/issues")
    public PagedResponse<IssueResponse> issues(
            @RequestParam long applicationId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String release,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "lastSeen") String sort,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        validateIssueFilters(status, from, to, query, sort);
        PageWindow window = PageWindow.of(page, pageSize);
        List<IssueResponse> items = issueMapper.findIssues(applicationId, status, environment, release, userId,
                        from, to, query, sort, window.limit(), window.offset())
                .stream().map(IssueResponse::from).toList();
        long total = issueMapper.countIssues(applicationId, status, environment, release, userId, from, to, query);
        return new PagedResponse<>(items, total, window.page(), window.limit());
    }

    @GetMapping("/api/v1/issues/{issueId}")
    public IssueDetailResponse issue(@PathVariable long issueId, @RequestParam long applicationId) {
        IssueRow issue = issueService.requireIssue(applicationId, issueId);
        EventDetailResponse latestEvent = issue.latestEventId() == null ? null
                : EventDetailResponse.from(eventMapper.findById(applicationId, issue.latestEventId()), objectMapper);
        List<StatusHistoryResponse> history = statusHistoryMapper.findByIssueId(issueId).stream()
                .map(StatusHistoryResponse::from).toList();
        return IssueDetailResponse.from(issue, latestEvent, history);
    }

    @GetMapping("/api/v1/issues/{issueId}/events")
    public PagedResponse<ErrorEventSummary> issueEvents(
            @PathVariable long issueId,
            @RequestParam long applicationId,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String release,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        issueService.requireIssue(applicationId, issueId);
        validateTimeRange(from, to);
        PageWindow window = PageWindow.of(page, pageSize);
        List<ErrorEventSummary> items = eventMapper.findIssueEvents(applicationId, issueId, environment, release,
                        userId, from, to, window.limit(), window.offset()).stream()
                .map(ErrorEventSummary::from).toList();
        long total = eventMapper.countIssueEvents(applicationId, issueId, environment, release, userId, from, to);
        return new PagedResponse<>(items, total, window.page(), window.limit());
    }

    @GetMapping("/api/v1/events/{eventId}")
    public EventDetailResponse event(@PathVariable long eventId, @RequestParam long applicationId) {
        EventEntity event = eventMapper.findById(applicationId, eventId);
        if (event == null) throw new EventApiException(404, "EVENT_NOT_FOUND", "event does not exist");
        return EventDetailResponse.from(event, objectMapper);
    }

    @PatchMapping("/api/v1/issues/{issueId}/status")
    public IssueResponse updateIssueStatus(@PathVariable long issueId,
                                           @Valid @RequestBody UpdateIssueStatusRequest request) {
        if (!ISSUE_STATUSES.contains(request.status())) {
            throw new EventApiException(400, "INVALID_ISSUE_STATUS", "status is invalid");
        }
        return IssueResponse.from(issueService.updateStatus(request.applicationId(), issueId,
                request.status(), request.reason()));
    }

    @GetMapping("/api/v1/http-events")
    public PagedResponse<HttpEventResponse> httpEvents(@RequestParam long applicationId,
                                                       @RequestParam(required = false) String outcome,
                                                       @RequestParam(defaultValue = "1") int page,
                                                       @RequestParam(defaultValue = "20") int pageSize) {
        PageWindow window = PageWindow.of(page, pageSize);
        List<HttpEventResponse> items = eventMapper.findHttpEvents(applicationId, outcome, window.limit(), window.offset())
                .stream().map(HttpEventResponse::from).toList();
        return new PagedResponse<>(items, eventMapper.countHttpEvents(applicationId, outcome), window.page(), window.limit());
    }

    private void validateIssueFilters(String status, Long from, Long to, String query, String sort) {
        if (status != null && !status.isBlank() && !ISSUE_STATUSES.contains(status)) {
            throw new EventApiException(400, "INVALID_FILTER", "status filter is invalid");
        }
        if (!ISSUE_SORTS.contains(sort)) throw new EventApiException(400, "INVALID_FILTER", "sort is invalid");
        if (query != null && query.length() > 200) throw new EventApiException(400, "INVALID_FILTER", "query is too long");
        validateTimeRange(from, to);
    }

    private void validateTimeRange(Long from, Long to) {
        if (from != null && from < 0 || to != null && to < 0 || from != null && to != null && from > to) {
            throw new EventApiException(400, "INVALID_TIME_RANGE", "time range is invalid");
        }
    }

    public record PagedResponse<T>(List<T> items, long total, int page, int pageSize) {
    }

    public record IssueResponse(Long id, String title, String errorType, String status, String level,
                                Long firstSeenAt, Long lastSeenAt, long eventCount,
                                long affectedUserCount, long regressionCount) {
        static IssueResponse from(IssueRow row) {
            return new IssueResponse(row.id(), row.title(), row.errorType(), row.status(), row.level(),
                    row.firstSeenAt(), row.lastSeenAt(), row.eventCount(), row.affectedUserCount(),
                    row.regressionCount());
        }
    }

    public record IssueDetailResponse(Long id, String fingerprint, int fingerprintVersion, String title,
                                      String errorType, String status, String level, Long statusChangedAt,
                                      Long resolvedAt, Long lastRegressedAt, long regressionCount,
                                      Long firstSeenAt, Long lastSeenAt, long eventCount, long affectedUserCount,
                                      EventDetailResponse latestEvent, List<StatusHistoryResponse> statusHistory) {
        static IssueDetailResponse from(IssueRow row, EventDetailResponse latestEvent,
                                        List<StatusHistoryResponse> history) {
            return new IssueDetailResponse(row.id(), row.fingerprint(), row.fingerprintVersion(), row.title(),
                    row.errorType(), row.status(), row.level(), row.statusChangedAt(), row.resolvedAt(),
                    row.lastRegressedAt(), row.regressionCount(), row.firstSeenAt(), row.lastSeenAt(),
                    row.eventCount(), row.affectedUserCount(), latestEvent, history);
        }
    }

    public record ErrorEventSummary(Long id, String eventId, Long occurredAt, String environment,
                                    String releaseName, String pageUrl, String pagePath, String userId,
                                    String anonymousId, String sessionId) {
        static ErrorEventSummary from(EventEntity event) {
            return new ErrorEventSummary(event.getId(), event.getEventId(), event.getOccurredAt(),
                    event.getEnvironment(), event.getReleaseName(), event.getPageUrl(), event.getPagePath(),
                    event.getUserId(), event.getAnonymousId(), event.getSessionId());
        }
    }

    public record EventDetailResponse(Long id, String eventId, Long issueId, Long occurredAt, Long receivedAt,
                                      String environment, String releaseName, String pageUrl, String pagePath,
                                      String userId, String anonymousId, String sessionId, String traceId,
                                      String errorName, String errorMessage, JsonNode payload,
                                      JsonNode context, JsonNode breadcrumbs) {
        static EventDetailResponse from(EventEntity event, ObjectMapper objectMapper) {
            if (event == null) return null;
            return new EventDetailResponse(event.getId(), event.getEventId(), event.getIssueId(),
                    event.getOccurredAt(), event.getReceivedAt(), event.getEnvironment(), event.getReleaseName(),
                    event.getPageUrl(), event.getPagePath(), event.getUserId(), event.getAnonymousId(),
                    event.getSessionId(), event.getTraceId(), event.getErrorName(), event.getErrorMessage(),
                    objectMapper.readTree(event.getPayload()), objectMapper.readTree(event.getContext()),
                    event.getBreadcrumbs() == null ? null : objectMapper.readTree(event.getBreadcrumbs()));
        }
    }

    public record StatusHistoryResponse(Long id, String fromStatus, String toStatus, String changeType,
                                        String reason, Long changedBy, Long changedAt) {
        static StatusHistoryResponse from(StatusHistoryRow row) {
            return new StatusHistoryResponse(row.id(), row.fromStatus(), row.toStatus(), row.changeType(),
                    row.reason(), row.changedBy(), row.changedAt());
        }
    }

    public record UpdateIssueStatusRequest(@NotNull Long applicationId, @NotBlank String status,
                                           @Size(max = 500) String reason) {
    }

    public record HttpEventResponse(Long id, String eventId, Long occurredAt, String environment,
                                    String releaseName, String pageUrl, String method, String url, Integer status,
                                    BigDecimal durationMs, String outcome) {
        static HttpEventResponse from(EventEntity event) {
            return new HttpEventResponse(event.getId(), event.getEventId(), event.getOccurredAt(), event.getEnvironment(),
                    event.getReleaseName(), event.getPageUrl(), event.getHttpMethod(), event.getHttpUrl(),
                    event.getHttpStatus(), event.getHttpDurationMs(), event.getHttpOutcome());
        }
    }

    private record PageWindow(int page, int limit, int offset) {
        static PageWindow of(int page, int pageSize) {
            int safePage = Math.max(1, page);
            int safeSize = Math.min(100, Math.max(1, pageSize));
            return new PageWindow(safePage, safeSize, (safePage - 1) * safeSize);
        }
    }
}
