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
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class EventWriter {
    private final EventMapper eventMapper;
    private final IssueMapper issueMapper;
    private final UrlSanitizer urlSanitizer;
    private final ObjectMapper objectMapper;

    public EventWriter(EventMapper eventMapper, IssueMapper issueMapper, UrlSanitizer urlSanitizer, ObjectMapper objectMapper) {
        this.eventMapper = eventMapper;
        this.issueMapper = issueMapper;
        this.urlSanitizer = urlSanitizer;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean store(long applicationId, EventBatchRequest batch, TraceEventRequest request, Object typedPayload) {
        EventEntity event = toEntity(applicationId, batch, request, typedPayload);
        if (eventMapper.insertIgnore(event) == 0) return false;
        if (typedPayload instanceof ErrorPayload errorPayload) {
            String fingerprint = fingerprint(errorPayload);
            IssueEntity issue = new IssueEntity();
            issue.setApplicationId(applicationId);
            issue.setFingerprint(fingerprint);
            issue.setTitle(errorPayload.message());
            issue.setErrorType(errorPayload.name());
            issue.setFirstSeenAt(event.getOccurredAt());
            issue.setLastSeenAt(event.getOccurredAt());
            issue.setCreatedAt(event.getReceivedAt());
            issue.setUpdatedAt(event.getReceivedAt());
            issue.setAffectedUserCount(request.user() == null ? 0 : 1);
            issueMapper.upsert(issue);
            Long issueId = issueMapper.findId(applicationId, fingerprint);
            eventMapper.attachIssue(event.getId(), issueId);
            issueMapper.updateLatestEvent(issueId, event.getId());
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

    private String fingerprint(ErrorPayload payload) {
        String firstFrame = payload.stack() == null ? "" : payload.stack().lines().skip(1).findFirst().orElse("");
        String source = payload.mechanism() + '\n' + payload.name() + '\n' + payload.message() + '\n' + firstFrame;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
}
