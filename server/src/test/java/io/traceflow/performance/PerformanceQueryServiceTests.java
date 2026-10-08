package io.traceflow.performance;

import io.traceflow.event.EventApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PerformanceQueryServiceTests {
    private static final Clock CLOCK = Clock.fixed(Instant.ofEpochMilli(10 * PerformanceQueryService.DAY_MS),
            ZoneOffset.UTC);
    private final PerformanceQueryMapper mapper = mock(PerformanceQueryMapper.class);
    private final PerformanceQueryService service = new PerformanceQueryService(mapper, new ObjectMapper(), CLOCK, 20);

    @Test
    void mergesHistogramBucketsAndCalculatesApproximatePercentiles() {
        when(mapper.findBuckets(eq(1L), eq(0L), eq(PerformanceQueryService.HOUR_MS), anyList()))
                .thenReturn(List.of(
                        row(0, "LCP", "ms", "production", "/checkout", 4, "8500", "1200", "3000",
                                2, 1, 1, "TIMING_MS_V1", buckets(7, 3, 9, 1)),
                        row(0, "LCP", "ms", "staging", "/checkout", 10, "10000", "1000", "1000",
                                10, 0, 0, "TIMING_MS_V1", buckets(5, 10))));

        var response = service.summary(filter(0, PerformanceQueryService.HOUR_MS, "production"), List.of("LCP"));

        assertThat(response.metrics()).hasSize(1);
        var metric = response.metrics().get(0);
        assertThat(metric.sampleCount()).isEqualTo(4);
        assertThat(metric.p75()).isEqualByComparingTo("2000");
        assertThat(metric.p95()).isEqualByComparingTo("3000");
        assertThat(metric.average()).isEqualByComparingTo("2125");
        assertThat(metric.ratings().poor()).isEqualTo(1);
        assertThat(metric.percentileMethod()).isEqualTo("fixed_histogram_v1");
    }

    @Test
    void fillsMissingTrendPointsWithNullValues() {
        long hour = PerformanceQueryService.HOUR_MS;
        when(mapper.findBuckets(eq(1L), eq(0L), eq(2 * hour), anyList()))
                .thenReturn(List.of(row(hour, "CLS", "score", "production", "/", 1, "0.08", "0.08", "0.08",
                        1, 0, 0, "CLS_SCORE_V1", buckets(4, 1))));

        var response = service.trends(filter(0, 2 * hour, null), List.of("CLS"), "hour");

        assertThat(response.series()).hasSize(1);
        assertThat(response.series().get(0).points()).hasSize(3);
        assertThat(response.series().get(0).points().get(0).sampleCount()).isZero();
        assertThat(response.series().get(0).points().get(0).p75()).isNull();
        assertThat(response.series().get(0).points().get(1).p75()).isEqualByComparingTo("0.1");
        assertThat(response.series().get(0).points().get(2).average()).isNull();
    }

    @Test
    void keepsRequestedSummaryMetricsStableWhenThereAreNoSamples() {
        when(mapper.findBuckets(eq(1L), eq(0L), eq(PerformanceQueryService.HOUR_MS), anyList()))
                .thenReturn(List.of());

        var response = service.summary(filter(0, PerformanceQueryService.HOUR_MS, null), List.of("LCP", "CLS"));

        assertThat(response.metrics()).extracting(PerformanceQueryService.MetricSummary::metric)
                .containsExactly("LCP", "CLS");
        assertThat(response.metrics()).allSatisfy(metric -> {
            assertThat(metric.sampleCount()).isZero();
            assertThat(metric.p75()).isNull();
            assertThat(metric.average()).isNull();
        });
    }

    @Test
    void rejectsRangesLongerThanNinetyDaysAndTooManyMetrics() {
        assertThatThrownBy(() -> service.summary(filter(0, 91 * PerformanceQueryService.DAY_MS, null), null))
                .isInstanceOf(EventApiException.class)
                .hasMessageContaining("90 days");

        assertThatThrownBy(() -> service.trends(filter(0, PerformanceQueryService.HOUR_MS, null),
                List.of("LCP", "INP", "CLS", "FCP", "TTFB", "NAV_DNS", "NAV_TCP", "NAV_TLS",
                        "NAV_REQUEST", "NAV_RESPONSE", "NAV_LOAD"), "hour"))
                .isInstanceOf(EventApiException.class)
                .hasMessageContaining("10");
    }

    @Test
    void parsesResourceDetailsAndDefaultsToTheLastTwentyFourHours() {
        long now = CLOCK.millis();
        when(mapper.findSlowResources(1, now - PerformanceQueryService.DAY_MS, now,
                null, null, null, null, 100)).thenReturn(List.of(new ResourceEventRow(
                9, "event-9", now - 1000, "production", "web@1", "https://example.test/", "/",
                "https://cdn.example.test/app.js", "script", new BigDecimal("486.320"),
                "{\"sizeAvailable\":true,\"transferSize\":84021,\"nextHopProtocol\":\"h2\"}", "{}")));

        var response = service.resources(1, null, null, null, null, null, null, 100);

        assertThat(response.from()).isEqualTo(now - PerformanceQueryService.DAY_MS);
        assertThat(response.items()).singleElement().satisfies(item -> {
            assertThat(item.transferSize()).isEqualTo(84021);
            assertThat(item.nextHopProtocol()).isEqualTo("h2");
            assertThat(item.durationMs()).isEqualByComparingTo("486.320");
        });
    }

    private PerformanceQueryService.QueryFilter filter(long from, long to, String environment) {
        return new PerformanceQueryService.QueryFilter(1, from, to, environment, null, null, null);
    }

    private PerformanceBucketRow row(long bucketStart, String metric, String unit, String environment,
                                     String pagePath, long sampleCount, String sum, String min, String max,
                                     long good, long needsImprovement, long poor, String histogramKind,
                                     long[] buckets) {
        return new PerformanceBucketRow(bucketStart, metric, unit,
                "{\"environment\":\"" + environment + "\",\"release\":\"web@1\",\"pagePath\":\""
                        + pagePath + "\",\"deviceType\":\"desktop\",\"resourceType\":\"\"}",
                sampleCount, new BigDecimal(sum), new BigDecimal(min), new BigDecimal(max),
                good, needsImprovement, poor, histogramKind,
                buckets[0], buckets[1], buckets[2], buckets[3], buckets[4], buckets[5], buckets[6], buckets[7],
                buckets[8], buckets[9], buckets[10], buckets[11], buckets[12], buckets[13], buckets[14], buckets[15]);
    }

    private long[] buckets(int... indexAndCount) {
        long[] buckets = new long[16];
        for (int index = 0; index < indexAndCount.length; index += 2) {
            buckets[indexAndCount[index]] = indexAndCount[index + 1];
        }
        return buckets;
    }
}
