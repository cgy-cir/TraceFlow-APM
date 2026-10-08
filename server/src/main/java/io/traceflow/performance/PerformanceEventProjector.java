package io.traceflow.performance;

import io.traceflow.event.EventEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class PerformanceEventProjector {
    private static final Logger log = LoggerFactory.getLogger(PerformanceEventProjector.class);
    private static final Map<String, String> NAVIGATION_METRICS = Map.ofEntries(
            Map.entry("dns", "NAV_DNS"),
            Map.entry("tcp", "NAV_TCP"),
            Map.entry("tls", "NAV_TLS"),
            Map.entry("request", "NAV_REQUEST"),
            Map.entry("response", "NAV_RESPONSE"),
            Map.entry("domInteractive", "NAV_DOM_INTERACTIVE"),
            Map.entry("domContentLoaded", "NAV_DCL"),
            Map.entry("load", "NAV_LOAD"));

    private final ObjectMapper objectMapper;

    public PerformanceEventProjector(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public List<MetricSample> project(EventEntity event) {
        try {
            if ("performance".equals(event.getType()) && "web_vital".equals(event.getPerformanceKind())) {
                return List.of(sample(event, event.getMetricName(), event.getMetricUnit(), event.getMetricValue(),
                        event.getMetricRating(), ""));
            }
            if ("performance".equals(event.getType()) && "navigation".equals(event.getPerformanceKind())) {
                return projectNavigation(event);
            }
            if ("resource".equals(event.getType())) return projectResource(event);
            return List.of();
        } catch (RuntimeException exception) {
            // Ingest validation should make this unreachable. Skipping prevents one corrupt legacy row blocking a checkpoint.
            log.warn("Skipping malformed performance event during aggregation: eventId={}", event.getId(), exception);
            return List.of();
        }
    }

    private List<MetricSample> projectNavigation(EventEntity event) {
        JsonNode payload = objectMapper.readTree(event.getPayload());
        List<MetricSample> samples = new ArrayList<>();
        NAVIGATION_METRICS.forEach((field, metricName) -> {
            BigDecimal value = nonNegativeNumber(payload.get(field));
            if (value != null) samples.add(sample(event, metricName, "ms", value, null, ""));
        });
        return samples;
    }

    private List<MetricSample> projectResource(EventEntity event) {
        List<MetricSample> samples = new ArrayList<>();
        samples.add(sample(event, "RESOURCE_DURATION", "ms", event.getResourceDurationMs(), null,
                valueOrEmpty(event.getResourceType())));
        JsonNode payload = objectMapper.readTree(event.getPayload());
        if (payload.path("sizeAvailable").asBoolean(false)) {
            BigDecimal transferSize = nonNegativeInteger(payload.get("transferSize"));
            if (transferSize != null) {
                samples.add(sample(event, "RESOURCE_TRANSFER_SIZE", "bytes", transferSize, null,
                        valueOrEmpty(event.getResourceType())));
            }
        }
        return samples;
    }

    private MetricSample sample(EventEntity event, String metricName, String unit, BigDecimal value,
                                String rating, String resourceType) {
        if (metricName == null || unit == null || value == null || value.signum() < 0) {
            throw new IllegalArgumentException("Metric sample is incomplete");
        }
        String dimensions = dimensions(event, resourceType);
        return new MetricSample(event.getOccurredAt(), metricName, unit, value, rating,
                HistogramKind.forMetric(metricName, unit), dimensions, sha256(dimensions));
    }

    private String dimensions(EventEntity event, String resourceType) {
        LinkedHashMap<String, String> values = new LinkedHashMap<>();
        values.put("environment", valueOrEmpty(event.getEnvironment()));
        values.put("release", valueOrEmpty(event.getReleaseName()));
        values.put("pagePath", valueOrEmpty(event.getPagePath()));
        values.put("deviceType", deviceType(event.getContext()));
        values.put("resourceType", valueOrEmpty(resourceType));
        return objectMapper.writeValueAsString(values);
    }

    private String deviceType(String contextJson) {
        if (contextJson == null || contextJson.isBlank()) return "unknown";
        JsonNode device = objectMapper.readTree(contextJson).path("device");
        if (device.isMissingNode() || device.isNull()) return "unknown";
        String userAgent = device.path("userAgent").asText("").toLowerCase(Locale.ROOT);
        if (userAgent.contains("ipad") || userAgent.contains("tablet")
                || userAgent.contains("android") && !userAgent.contains("mobile")) return "tablet";
        if (userAgent.contains("mobi") || userAgent.contains("iphone") || userAgent.contains("android")) {
            return "mobile";
        }
        if (!userAgent.isBlank()) return "desktop";
        int viewportWidth = device.path("viewportWidth").asInt(-1);
        if (viewportWidth < 0) return "unknown";
        if (viewportWidth <= 767) return "mobile";
        if (viewportWidth <= 1024) return "tablet";
        return "desktop";
    }

    private BigDecimal nonNegativeNumber(JsonNode node) {
        if (node == null || !node.isNumber()) return null;
        BigDecimal value = node.decimalValue();
        return value.signum() >= 0 ? value : null;
    }

    private BigDecimal nonNegativeInteger(JsonNode node) {
        BigDecimal value = nonNegativeNumber(node);
        return value != null && value.stripTrailingZeros().scale() <= 0 ? value : null;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record MetricSample(long occurredAt, String metricName, String unit, BigDecimal value, String rating,
                               HistogramKind histogramKind, String dimensions, String dimensionHash) {
    }
}
