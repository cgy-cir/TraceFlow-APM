package io.traceflow.event;

public class IssueEntity {
    private Long id;
    private Long applicationId;
    private String fingerprint;
    private String title;
    private String errorType;
    private Long firstSeenAt;
    private Long lastSeenAt;
    private Long createdAt;
    private Long updatedAt;
    private long affectedUserCount;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public String getFingerprint() { return fingerprint; }
    public void setFingerprint(String fingerprint) { this.fingerprint = fingerprint; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getErrorType() { return errorType; }
    public void setErrorType(String errorType) { this.errorType = errorType; }
    public Long getFirstSeenAt() { return firstSeenAt; }
    public void setFirstSeenAt(Long firstSeenAt) { this.firstSeenAt = firstSeenAt; }
    public Long getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Long lastSeenAt) { this.lastSeenAt = lastSeenAt; }
    public Long getCreatedAt() { return createdAt; }
    public void setCreatedAt(Long createdAt) { this.createdAt = createdAt; }
    public Long getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Long updatedAt) { this.updatedAt = updatedAt; }
    public long getAffectedUserCount() { return affectedUserCount; }
    public void setAffectedUserCount(long affectedUserCount) { this.affectedUserCount = affectedUserCount; }
}
