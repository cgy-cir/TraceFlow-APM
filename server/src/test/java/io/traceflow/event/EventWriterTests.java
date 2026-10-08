package io.traceflow.event;

import io.traceflow.event.EventBatchRequest.PageContext;
import io.traceflow.event.EventBatchRequest.SdkContext;
import io.traceflow.event.EventBatchRequest.TraceEventRequest;
import io.traceflow.event.EventValidationService.ResourcePayload;
import io.traceflow.event.EventValidationService.WebVitalAttribution;
import io.traceflow.event.EventValidationService.WebVitalPayload;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EventWriterTests {
    private final EventMapper eventMapper = mock(EventMapper.class);
    private final EventWriter writer = new EventWriter(
            eventMapper,
            mock(IssueMapper.class),
            new UrlSanitizer(),
            new ObjectMapper(),
            mock(ErrorFingerprintService.class),
            mock(IssueActorMapper.class),
            mock(IssueStatusHistoryMapper.class));

    @Test
    void extractsWebVitalColumnsAndSanitizesAttributionUrl() {
        when(eventMapper.insertIgnore(any())).thenReturn(1);
        Map<String, Object> payload = Map.of(
                "kind", "web_vital",
                "metricName", "LCP",
                "measurementId", "metric-1",
                "value", 1234.56789,
                "delta", 1234.56789,
                "unit", "ms",
                "rating", "good",
                "navigationType", "navigate",
                "attribution", Map.of("resourceUrl", "https://cdn.example.com/a.js?token=secret"));
        WebVitalPayload typedPayload = new WebVitalPayload(
                "web_vital", "LCP", "metric-1", 1234.56789, 1234.56789, "ms", "good", "navigate",
                new WebVitalAttribution(null, "https://cdn.example.com/a.js?token=secret", null,
                        null, null, null, null, null, null, null, null, null));

        assertThat(writer.store(1, batch(), event("performance", payload), typedPayload)).isTrue();

        EventEntity entity = insertedEntity();
        assertThat(entity.getPerformanceKind()).isEqualTo("web_vital");
        assertThat(entity.getMetricName()).isEqualTo("LCP");
        assertThat(entity.getMeasurementId()).isEqualTo("metric-1");
        assertThat(entity.getMetricValue()).isEqualByComparingTo(new BigDecimal("1234.5679"));
        assertThat(entity.getMetricUnit()).isEqualTo("ms");
        assertThat(entity.getMetricRating()).isEqualTo("good");
        assertThat(entity.getPayload()).contains("token=%5BFiltered%5D").doesNotContain("token=secret");
    }

    @Test
    void extractsAndSanitizesResourceColumns() {
        when(eventMapper.insertIgnore(any())).thenReturn(1);
        Map<String, Object> payload = Map.of(
                "url", "https://cdn.example.com/app.js?access_token=secret",
                "initiatorType", "script",
                "startTime", 10.0,
                "duration", 42.1236,
                "sizeAvailable", false);
        ResourcePayload typedPayload = new ResourcePayload(
                "https://cdn.example.com/app.js?access_token=secret", "script", 10.0, 42.1236,
                null, null, null, false, null, null);

        assertThat(writer.store(1, batch(), event("resource", payload), typedPayload)).isTrue();

        EventEntity entity = insertedEntity();
        assertThat(entity.getResourceUrl()).contains("access_token=%5BFiltered%5D");
        assertThat(entity.getResourceType()).isEqualTo("script");
        assertThat(entity.getResourceDurationMs()).isEqualByComparingTo(new BigDecimal("42.124"));
        assertThat(entity.getPayload()).doesNotContain("access_token=secret");
    }

    private EventEntity insertedEntity() {
        ArgumentCaptor<EventEntity> captor = ArgumentCaptor.forClass(EventEntity.class);
        verify(eventMapper).insertIgnore(captor.capture());
        return captor.getValue();
    }

    private EventBatchRequest batch() {
        return new EventBatchRequest(1, "batch-id", "app-key", 1L,
                new SdkContext("@traceflow/web-sdk", "0.1.0"), List.of());
    }

    private TraceEventRequest event(String type, Map<String, Object> payload) {
        return new TraceEventRequest(
                "58fcf769-d55a-4df5-b0b9-733f87f35f99",
                type,
                1L,
                "a2e10c1f-7f08-4819-a430-fb7c9c5ed7b3",
                "anonymous-1",
                "test",
                "1.0.0",
                null,
                new PageContext("https://demo.example.com/orders", "/orders", "Orders", null),
                null,
                null,
                Map.of(),
                null,
                payload);
    }
}
