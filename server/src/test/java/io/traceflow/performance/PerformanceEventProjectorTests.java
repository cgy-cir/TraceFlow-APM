package io.traceflow.performance;

import io.traceflow.event.EventEntity;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class PerformanceEventProjectorTests {
    private final PerformanceEventProjector projector = new PerformanceEventProjector(new ObjectMapper());

    @Test
    void projectsWebVitalWithCanonicalDimensions() {
        EventEntity event = baseEvent();
        event.setType("performance");
        event.setPerformanceKind("web_vital");
        event.setMetricName("LCP");
        event.setMetricUnit("ms");
        event.setMetricValue(new BigDecimal("2500.0000"));
        event.setMetricRating("good");

        var samples = projector.project(event);

        assertThat(samples).hasSize(1);
        var sample = samples.get(0);
        assertThat(sample.metricName()).isEqualTo("LCP");
        assertThat(sample.histogramKind()).isEqualTo(HistogramKind.TIMING_MS_V1);
        assertThat(sample.dimensions()).isEqualTo(
                "{\"environment\":\"production\",\"release\":\"demo@1.0.0\",\"pagePath\":\"/orders\",\"deviceType\":\"mobile\",\"resourceType\":\"\"}");
        assertThat(sample.dimensionHash()).hasSize(64);
    }

    @Test
    void projectsNavigationPhasesAndResourceTransferSize() {
        EventEntity navigation = baseEvent();
        navigation.setType("performance");
        navigation.setPerformanceKind("navigation");
        navigation.setPayload("""
                {"kind":"navigation","dns":4.2,"tcp":12.8,"tls":8.1,"request":180.4,
                 "response":31.6,"domInteractive":845.7,"domContentLoaded":912.2,"load":1234.5}
                """);
        EventEntity resource = baseEvent();
        resource.setType("resource");
        resource.setResourceType("script");
        resource.setResourceDurationMs(new BigDecimal("486.320"));
        resource.setPayload("""
                {"sizeAvailable":true,"transferSize":9007199254740991}
                """);

        var navigationSamples = projector.project(navigation);
        var resourceSamples = projector.project(resource);

        assertThat(navigationSamples).hasSize(8);
        assertThat(navigationSamples).extracting(PerformanceEventProjector.MetricSample::metricName)
                .contains("NAV_DNS", "NAV_DCL", "NAV_LOAD");
        assertThat(resourceSamples).hasSize(2);
        assertThat(resourceSamples.get(1).metricName()).isEqualTo("RESOURCE_TRANSFER_SIZE");
        assertThat(resourceSamples.get(1).value()).isEqualByComparingTo("9007199254740991");
        assertThat(resourceSamples.get(1).histogramKind()).isEqualTo(HistogramKind.SIZE_BYTES_V1);
    }

    private EventEntity baseEvent() {
        EventEntity event = new EventEntity();
        event.setId(100L);
        event.setOccurredAt(1_791_234_567_000L);
        event.setEnvironment("production");
        event.setReleaseName("demo@1.0.0");
        event.setPagePath("/orders");
        event.setContext("""
                {"device":{"userAgent":"Mozilla/5.0 (Linux; Android 15; Mobile)","viewportWidth":390}}
                """);
        return event;
    }
}
