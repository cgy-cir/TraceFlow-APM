package io.traceflow.event;

import io.traceflow.event.IssueMapper.IssueRow;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
public class EventQueryApi {
    private final IssueMapper issueMapper;
    private final EventMapper eventMapper;

    public EventQueryApi(IssueMapper issueMapper, EventMapper eventMapper) {
        this.issueMapper = issueMapper;
        this.eventMapper = eventMapper;
    }

    @GetMapping("/api/v1/issues")
    public PagedResponse<IssueResponse> issues(@RequestParam long applicationId,
                                               @RequestParam(required = false) String status,
                                               @RequestParam(defaultValue = "1") int page,
                                               @RequestParam(defaultValue = "20") int pageSize) {
        PageWindow window = PageWindow.of(page, pageSize);
        List<IssueResponse> items = issueMapper.findIssues(applicationId, status, window.limit(), window.offset())
                .stream().map(IssueResponse::from).toList();
        return new PagedResponse<>(items, issueMapper.countIssues(applicationId, status), window.page(), window.limit());
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

    public record PagedResponse<T>(List<T> items, long total, int page, int pageSize) {
    }

    public record IssueResponse(Long id, String title, String errorType, String status, String level,
                                Long firstSeenAt, Long lastSeenAt, long eventCount,
                                long affectedUserCount) {
        static IssueResponse from(IssueRow row) {
            return new IssueResponse(row.id(), row.title(), row.errorType(), row.status(), row.level(),
                    row.firstSeenAt(), row.lastSeenAt(), row.eventCount(), row.affectedUserCount());
        }
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
