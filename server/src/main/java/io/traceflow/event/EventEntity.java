package io.traceflow.event;

import java.math.BigDecimal;

public class EventEntity {
    private Long id;
    private String eventId;
    private Long applicationId;
    private Long issueId;
    private Integer schemaVersion;
    private String type;
    private Long occurredAt;
    private Long receivedAt;
    private Long createdAt;
    private String environment;
    private String releaseName;
    private String sessionId;
    private String anonymousId;
    private String userId;
    private String traceId;
    private String pageUrl;
    private String pagePath;
    private String errorName;
    private String errorMessage;
    private String httpMethod;
    private String httpUrl;
    private Integer httpStatus;
    private BigDecimal httpDurationMs;
    private String httpOutcome;
    private String performanceKind;
    private String metricName;
    private String measurementId;
    private BigDecimal metricValue;
    private String metricUnit;
    private String metricRating;
    private String resourceUrl;
    private String resourceType;
    private BigDecimal resourceDurationMs;
    private String payload;
    private String context;
    private String breadcrumbs;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public Long getIssueId() { return issueId; }
    public void setIssueId(Long issueId) { this.issueId = issueId; }
    public Integer getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(Integer schemaVersion) { this.schemaVersion = schemaVersion; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Long getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Long occurredAt) { this.occurredAt = occurredAt; }
    public Long getReceivedAt() { return receivedAt; }
    public void setReceivedAt(Long receivedAt) { this.receivedAt = receivedAt; }
    public Long getCreatedAt() { return createdAt; }
    public void setCreatedAt(Long createdAt) { this.createdAt = createdAt; }
    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }
    public String getReleaseName() { return releaseName; }
    public void setReleaseName(String releaseName) { this.releaseName = releaseName; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getAnonymousId() { return anonymousId; }
    public void setAnonymousId(String anonymousId) { this.anonymousId = anonymousId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTraceId() { return traceId; }
    public void setTraceId(String traceId) { this.traceId = traceId; }
    public String getPageUrl() { return pageUrl; }
    public void setPageUrl(String pageUrl) { this.pageUrl = pageUrl; }
    public String getPagePath() { return pagePath; }
    public void setPagePath(String pagePath) { this.pagePath = pagePath; }
    public String getErrorName() { return errorName; }
    public void setErrorName(String errorName) { this.errorName = errorName; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }
    public String getHttpUrl() { return httpUrl; }
    public void setHttpUrl(String httpUrl) { this.httpUrl = httpUrl; }
    public Integer getHttpStatus() { return httpStatus; }
    public void setHttpStatus(Integer httpStatus) { this.httpStatus = httpStatus; }
    public BigDecimal getHttpDurationMs() { return httpDurationMs; }
    public void setHttpDurationMs(BigDecimal httpDurationMs) { this.httpDurationMs = httpDurationMs; }
    public String getHttpOutcome() { return httpOutcome; }
    public void setHttpOutcome(String httpOutcome) { this.httpOutcome = httpOutcome; }
    public String getPerformanceKind() { return performanceKind; }
    public void setPerformanceKind(String performanceKind) { this.performanceKind = performanceKind; }
    public String getMetricName() { return metricName; }
    public void setMetricName(String metricName) { this.metricName = metricName; }
    public String getMeasurementId() { return measurementId; }
    public void setMeasurementId(String measurementId) { this.measurementId = measurementId; }
    public BigDecimal getMetricValue() { return metricValue; }
    public void setMetricValue(BigDecimal metricValue) { this.metricValue = metricValue; }
    public String getMetricUnit() { return metricUnit; }
    public void setMetricUnit(String metricUnit) { this.metricUnit = metricUnit; }
    public String getMetricRating() { return metricRating; }
    public void setMetricRating(String metricRating) { this.metricRating = metricRating; }
    public String getResourceUrl() { return resourceUrl; }
    public void setResourceUrl(String resourceUrl) { this.resourceUrl = resourceUrl; }
    public String getResourceType() { return resourceType; }
    public void setResourceType(String resourceType) { this.resourceType = resourceType; }
    public BigDecimal getResourceDurationMs() { return resourceDurationMs; }
    public void setResourceDurationMs(BigDecimal resourceDurationMs) { this.resourceDurationMs = resourceDurationMs; }
    public String getPayload() { return payload; }
    public void setPayload(String payload) { this.payload = payload; }
    public String getContext() { return context; }
    public void setContext(String context) { this.context = context; }
    public String getBreadcrumbs() { return breadcrumbs; }
    public void setBreadcrumbs(String breadcrumbs) { this.breadcrumbs = breadcrumbs; }
}
