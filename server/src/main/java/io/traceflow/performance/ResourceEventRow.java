package io.traceflow.performance;

import java.math.BigDecimal;

public record ResourceEventRow(long id, String eventId, long occurredAt, String environment, String releaseName,
                               String pageUrl, String pagePath, String resourceUrl, String resourceType,
                               BigDecimal resourceDurationMs, String payload, String context) {
}
