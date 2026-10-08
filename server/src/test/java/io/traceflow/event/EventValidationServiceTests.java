package io.traceflow.event;

import io.traceflow.event.EventBatchRequest.PageContext;
import io.traceflow.event.EventBatchRequest.TraceEventRequest;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class EventValidationServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-28T00:00:00Z");
    private final EventValidationService validationService =
            new EventValidationService(new ObjectMapper(), Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void acceptsAValidErrorEvent() {
        var result = validationService.validate(event(
                "5f23b358-0ad7-4f1a-9d94-17f728842502",
                NOW.toEpochMilli(),
                Map.of("mechanism", "manual", "name", "Error", "message", "checkout failed")));

        assertThat(result.valid()).isTrue();
        assertThat(result.typedPayload()).isInstanceOf(EventValidationService.ErrorPayload.class);
    }

    @Test
    void rejectsNonCanonicalUuidV4() {
        var result = validationService.validate(event(
                "5f23b358-0ad7-1f1a-9d94-17f728842502",
                NOW.toEpochMilli(),
                Map.of("mechanism", "manual", "name", "Error", "message", "checkout failed")));

        assertThat(result.valid()).isFalse();
        assertThat(result.code()).isEqualTo("INVALID_EVENT_ID");
    }

    @Test
    void rejectsEventsOlderThanSevenDays() {
        var result = validationService.validate(event(
                "5f23b358-0ad7-4f1a-9d94-17f728842502",
                NOW.minusSeconds(8 * 24 * 60 * 60).toEpochMilli(),
                Map.of("mechanism", "manual", "name", "Error", "message", "checkout failed")));

        assertThat(result.valid()).isFalse();
        assertThat(result.code()).isEqualTo("INVALID_TIMESTAMP");
    }

    @Test
    void rejectsNestedBreadcrumbData() {
        TraceEventRequest base = event(
                "5f23b358-0ad7-4f1a-9d94-17f728842502",
                NOW.toEpochMilli(),
                Map.of("mechanism", "manual", "name", "Error", "message", "checkout failed"));
        TraceEventRequest invalid = new TraceEventRequest(
                base.eventId(), base.type(), base.timestamp(), base.sessionId(), base.anonymousId(),
                base.environment(), base.release(), base.traceId(), base.page(), base.user(), base.device(),
                base.tags(), List.of(Map.of(
                        "timestamp", NOW.toEpochMilli(),
                        "category", "custom",
                        "level", "info",
                        "data", Map.of("nested", Map.of("secret", "value")))),
                base.payload());

        var result = validationService.validate(invalid);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).contains("breadcrumbs");
    }

    @Test
    void acceptsAValidWebVitalEvent() {
        var result = validationService.validate(event(
                "58fcf769-d55a-4df5-b0b9-733f87f35f99",
                "performance",
                null,
                Map.of(
                        "kind", "web_vital",
                        "metricName", "LCP",
                        "measurementId", "v5-1791234567000-123456789",
                        "value", 2384.72,
                        "delta", 2384.72,
                        "unit", "ms",
                        "rating", "good",
                        "navigationType", "navigate",
                        "attribution", Map.of(
                                "resourceUrl", "https://cdn.example.com/product.webp?token=secret",
                                "resourceLoadDuration", 812.4))));

        assertThat(result.valid()).isTrue();
        assertThat(result.typedPayload()).isInstanceOf(EventValidationService.WebVitalPayload.class);
    }

    @Test
    void acceptsNavigationAndResourceEvents() {
        var navigation = validationService.validate(event(
                "77f5ec20-9441-4d7a-82af-2401ea2d2649",
                "performance",
                null,
                Map.ofEntries(
                        Map.entry("kind", "navigation"),
                        Map.entry("navigationType", "reload"),
                        Map.entry("redirectCount", 0),
                        Map.entry("dns", 4.2),
                        Map.entry("tcp", 12.8),
                        Map.entry("tls", 8.1),
                        Map.entry("request", 180.4),
                        Map.entry("response", 31.6),
                        Map.entry("domInteractive", 845.7),
                        Map.entry("domContentLoaded", 912.2),
                        Map.entry("load", 1234.5))));
        var resource = validationService.validate(event(
                "1ba4f1b6-a8e5-4708-ac76-e30c36ae9245",
                "resource",
                null,
                Map.of(
                        "url", "https://cdn.example.com/app.js",
                        "initiatorType", "script",
                        "startTime", 38.12,
                        "duration", 486.32,
                        "transferSize", 84021,
                        "sizeAvailable", true,
                        "nextHopProtocol", "h2")));

        assertThat(navigation.valid()).isTrue();
        assertThat(navigation.typedPayload()).isInstanceOf(EventValidationService.NavigationTimingPayload.class);
        assertThat(resource.valid()).isTrue();
        assertThat(resource.typedPayload()).isInstanceOf(EventValidationService.ResourcePayload.class);
    }

    @Test
    void rejectsWebVitalWithMismatchedUnitOrAttribution() {
        Map<String, Object> invalidUnit = new java.util.LinkedHashMap<>(validWebVital());
        invalidUnit.put("metricName", "CLS");
        invalidUnit.put("unit", "ms");
        Map<String, Object> invalidAttribution = new java.util.LinkedHashMap<>(validWebVital());
        invalidAttribution.put("attribution", Map.of("inputDelay", 10));

        var unitResult = validationService.validate(event(
                "8ebd6aa8-426f-465b-8ef7-05c818db88e1", "performance", null, invalidUnit));
        var attributionResult = validationService.validate(event(
                "4927062f-ac3f-4fb3-af87-da340e47db70", "performance", null, invalidAttribution));

        assertThat(unitResult.valid()).isFalse();
        assertThat(unitResult.message()).contains("unit");
        assertThat(attributionResult.valid()).isFalse();
        assertThat(attributionResult.message()).contains("attribution");
    }

    @Test
    void rejectsPerformanceBreadcrumbsAndUnsafeResourceSize() {
        var performance = validationService.validate(event(
                "191e696a-513d-450a-8b3a-e24189fe11a7",
                "performance",
                List.of(Map.of(
                        "timestamp", NOW.toEpochMilli(),
                        "category", "custom",
                        "level", "info")),
                validWebVital()));
        var resource = validationService.validate(event(
                "204426ee-7ec0-4c60-ac3c-67f149f72d8f",
                "resource",
                null,
                Map.of(
                        "url", "https://cdn.example.com/app.js",
                        "initiatorType", "script",
                        "startTime", 1,
                        "duration", 2,
                        "transferSize", 9007199254740992L,
                        "sizeAvailable", true)));

        assertThat(performance.valid()).isFalse();
        assertThat(performance.message()).contains("breadcrumbs");
        assertThat(resource.valid()).isFalse();
    }

    private TraceEventRequest event(String eventId, long timestamp, Map<String, Object> payload) {
        return new TraceEventRequest(
                eventId,
                "error",
                timestamp,
                "a5fcff23-f840-48d0-865f-5e59022f931c",
                "anon-1",
                "development",
                "1.0.0",
                null,
                new PageContext("http://localhost:5174/checkout", "/checkout", "Checkout", ""),
                null,
                null,
                Map.of(),
                List.of(),
                payload);
    }

    private TraceEventRequest event(String eventId, String type, List<Map<String, Object>> breadcrumbs,
                                    Map<String, Object> payload) {
        TraceEventRequest base = event(eventId, NOW.toEpochMilli(), payload);
        return new TraceEventRequest(
                base.eventId(), type, base.timestamp(), base.sessionId(), base.anonymousId(),
                base.environment(), base.release(), base.traceId(), base.page(), base.user(), base.device(),
                base.tags(), breadcrumbs, payload);
    }

    private Map<String, Object> validWebVital() {
        return Map.of(
                "kind", "web_vital",
                "metricName", "LCP",
                "measurementId", "v5-1791234567000-123456789",
                "value", 2384.72,
                "delta", 2384.72,
                "unit", "ms",
                "rating", "good",
                "navigationType", "navigate");
    }
}
