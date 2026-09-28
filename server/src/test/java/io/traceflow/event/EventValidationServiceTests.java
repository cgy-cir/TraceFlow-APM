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
}
