package io.traceflow.performance;

import io.traceflow.event.EventEntity;
import io.traceflow.performance.PerformanceEventProjector.MetricSample;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PerformanceAggregationWorkerTests {
    private static final long NOW = 1_791_234_600_000L;
    private final PerformanceAggregationMapper mapper = mock(PerformanceAggregationMapper.class);
    private final PerformanceEventProjector projector = mock(PerformanceEventProjector.class);
    private final PerformanceAggregationWorker worker = new PerformanceAggregationWorker(
            mapper, projector, Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC), 1000);

    @Test
    void aggregatesSamplesAndAdvancesCheckpointToTheLastScannedEvent() {
        EventEntity first = event(11);
        EventEntity second = event(12);
        MetricSample firstSample = sample("LCP", "2500", "good");
        MetricSample secondSample = sample("LCP", "3000", "needs-improvement");
        when(mapper.lockCheckpoint(1)).thenReturn(10L);
        when(mapper.findEventsAfter(1, 10, 1000)).thenReturn(List.of(first, second));
        when(projector.project(first)).thenReturn(List.of(firstSample));
        when(projector.project(second)).thenReturn(List.of(secondSample));

        assertThat(worker.aggregateNextBatch(1)).isEqualTo(2);

        ArgumentCaptor<PerformanceMetricBucketDelta> captor =
                ArgumentCaptor.forClass(PerformanceMetricBucketDelta.class);
        verify(mapper).upsertBucket(captor.capture());
        PerformanceMetricBucketDelta delta = captor.getValue();
        assertThat(delta.getSampleCount()).isEqualTo(2);
        assertThat(delta.getMetricSum()).isEqualByComparingTo("5500");
        assertThat(delta.getGoodCount()).isEqualTo(1);
        assertThat(delta.getNeedsImprovementCount()).isEqualTo(1);
        verify(mapper).updateCheckpoint(1, 12, NOW);
    }

    @Test
    void advancesCheckpointWhenBatchContainsNoPerformanceSamples() {
        EventEntity event = event(21);
        when(mapper.lockCheckpoint(1)).thenReturn(20L);
        when(mapper.findEventsAfter(1, 20, 1000)).thenReturn(List.of(event));
        when(projector.project(event)).thenReturn(List.of());

        assertThat(worker.aggregateNextBatch(1)).isEqualTo(1);

        verify(mapper, never()).upsertBucket(any());
        verify(mapper).updateCheckpoint(1, 21, NOW);
    }

    private EventEntity event(long id) {
        EventEntity event = new EventEntity();
        event.setId(id);
        return event;
    }

    private MetricSample sample(String metric, String value, String rating) {
        return new MetricSample(1_791_234_567_000L, metric, "ms", new BigDecimal(value), rating,
                HistogramKind.TIMING_MS_V1, "{}", "hash");
    }
}
