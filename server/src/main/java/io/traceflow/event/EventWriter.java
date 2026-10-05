package io.traceflow.event;

import io.traceflow.event.EventBatchRequest.TraceEventRequest;
import io.traceflow.event.EventValidationService.ErrorPayload;
import io.traceflow.event.EventValidationService.HttpPayload;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.HexFormat;
import java.util.Map;

@Service
public class EventWriter {
    private final EventMapper eventMapper;
    private final IssueMapper issueMapper;
    private final UrlSanitizer urlSanitizer;
    private final ObjectMapper objectMapper;
    private final ErrorFingerprintService fingerprintService;
    private final IssueActorMapper issueActorMapper;
    private final IssueStatusHistoryMapper statusHistoryMapper;

    public EventWriter(EventMapper eventMapper, IssueMapper issueMapper, UrlSanitizer urlSanitizer,
                       ObjectMapper objectMapper, ErrorFingerprintService fingerprintService,
                       IssueActorMapper issueActorMapper, IssueStatusHistoryMapper statusHistoryMapper) {
        this.eventMapper = eventMapper;
        this.issueMapper = issueMapper;
        this.urlSanitizer = urlSanitizer;
        this.objectMapper = objectMapper;
        this.fingerprintService = fingerprintService;
        this.issueActorMapper = issueActorMapper;
        this.statusHistoryMapper = statusHistoryMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean store(long applicationId, EventBatchRequest batch, TraceEventRequest request, Object typedPayload) {
        EventEntity event = toEntity(applicationId, batch, request, typedPayload);
        if (eventMapper.insertIgnore(event) == 0) return false;
        if (typedPayload instanceof ErrorPayload errorPayload) {
            ErrorFingerprintService.FingerprintResult fingerprint = fingerprintService.fingerprint(errorPayload);
            IssueEntity issue = new IssueEntity();
            issue.setApplicationId(applicationId);
            issue.setFingerprint(fingerprint.value());
            issue.setFingerprintVersion(fingerprint.version());
            issue.setTitle(errorPayload.message());
            issue.setErrorType(errorPayload.name());
            issue.setStatusChangedAt(event.getReceivedAt());
            issue.setFirstSeenAt(event.getOccurredAt());
            issue.setLastSeenAt(event.getOccurredAt());
            issue.setCreatedAt(event.getReceivedAt());
            issue.setUpdatedAt(event.getReceivedAt());
            int upsertResult = issueMapper.upsert(issue);
            Long issueId = issueMapper.findId(applicationId, fingerprint.value());
            if (upsertResult == 1) {
                statusHistoryMapper.insert(issueId, null, "unresolved", "created",
                        "Issue created from first event", null, event.getReceivedAt());
            }
            String actorKey = actorKey(request);
            if (issueActorMapper.insertIgnore(issueId, actorKey, event.getOccurredAt()) == 1) {
                issueMapper.incrementAffectedUserCount(issueId);
            } else {
                issueActorMapper.updateSeen(issueId, actorKey, event.getOccurredAt());
            }
            eventMapper.attachIssue(event.getId(), issueId);
            issueMapper.updateLatestEvent(issueId, event.getId(), event.getOccurredAt());
            if (issueMapper.markRegressed(issueId, event.getReceivedAt()) == 1) {
                statusHistoryMapper.insert(issueId, "resolved", "regressed", "regression",
                        "A new event occurred after the issue was resolved", null, event.getReceivedAt());
            }
        }
        return true;
    }

    private EventEntity toEntity(long applicationId, EventBatchRequest batch, TraceEventRequest request, Object typedPayload) {
        EventEntity event = new EventEntity();
        event.setEventId(request.eventId());
        event.setApplicationId(applicationId);
        event.setSchemaVersion(batch.schemaVersion());
        event.setType(request.type());
        event.setOccurredAt(request.timestamp());
        event.setReceivedAt(System.currentTimeMillis());
        event.setCreatedAt(event.getReceivedAt());
        event.setEnvironment(request.environment());
        event.setReleaseName(request.release());
        event.setSessionId(request.sessionId());
        event.setAnonymousId(request.anonymousId());
        event.setUserId(request.user() == null ? null : request.user().id());
        event.setTraceId(request.traceId());
        event.setPageUrl(urlSanitizer.sanitize(request.page().url()));
        event.setPagePath(request.page().path());

        Map<String, Object> payload = new LinkedHashMap<>(request.payload());
        if (typedPayload instanceof ErrorPayload error) {
            event.setErrorName(error.name());
            event.setErrorMessage(error.message());
            if (error.filename() != null) payload.put("filename", urlSanitizer.sanitize(error.filename()));
        } else if (typedPayload instanceof HttpPayload http) {
            event.setHttpMethod(http.method().toUpperCase());
            event.setHttpUrl(urlSanitizer.sanitize(http.url()));
            event.setHttpStatus(http.status());
            event.setHttpDurationMs(BigDecimal.valueOf(http.duration()).setScale(3, RoundingMode.HALF_UP));
            event.setHttpOutcome(http.outcome());
            payload.put("method", http.method().toUpperCase());
            payload.put("url", event.getHttpUrl());
        }
        event.setPayload(objectMapper.writeValueAsString(payload));
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("page", request.page());
        context.put("user", request.user());
        context.put("device", request.device());
        context.put("tags", request.tags());
        context.put("sdk", batch.sdk());
        event.setContext(objectMapper.writeValueAsString(context));
        event.setBreadcrumbs(request.breadcrumbs() == null ? null : objectMapper.writeValueAsString(request.breadcrumbs()));
        return event;
    }

    private String actorKey(TraceEventRequest request) {
        String source;
        if (request.user() != null && request.user().id() != null && !request.user().id().isBlank()) {
            source = "user:" + request.user().id();
        } else if (request.anonymousId() != null && !request.anonymousId().isBlank()) {
            source = "anonymous:" + request.anonymousId();
        } else {
            source = "session:" + request.sessionId();
        }
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
