package io.traceflow.performance;

import io.traceflow.event.EventEntity;
import io.traceflow.performance.PerformanceEventProjector.MetricSample;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PerformanceAggregationWorker {
    private static final long HOUR_MS = 60 * 60 * 1000L;

    private final PerformanceAggregationMapper mapper;
    private final PerformanceEventProjector projector;
    private final Clock clock;
    private final int batchSize;

    @Autowired
    public PerformanceAggregationWorker(PerformanceAggregationMapper mapper, PerformanceEventProjector projector,
                                        @Value("${traceflow.performance.aggregation-batch-size:1000}") int batchSize) {
        this(mapper, projector, Clock.systemUTC(), batchSize);
    }

    PerformanceAggregationWorker(PerformanceAggregationMapper mapper, PerformanceEventProjector projector,
                                 Clock clock, int batchSize) {
        this.mapper = mapper;
        this.projector = projector;
        this.clock = clock;
        this.batchSize = Math.max(1, Math.min(batchSize, 10_000));
    }

    @Transactional
    public int aggregateNextBatch(long applicationId) {
        long now = clock.millis();
        mapper.insertCheckpointIfMissing(applicationId, now);
        Long checkpoint = mapper.lockCheckpoint(applicationId);
        if (checkpoint == null) return 0;

        List<EventEntity> events = mapper.findEventsAfter(applicationId, checkpoint, batchSize);
        if (events.isEmpty()) return 0;

        Map<BucketKey, PerformanceMetricBucketDelta> deltas = new LinkedHashMap<>();
        for (EventEntity event : events) {
            for (MetricSample sample : projector.project(event)) {
                long bucketStart = Math.floorDiv(sample.occurredAt(), HOUR_MS) * HOUR_MS;
                BucketKey key = new BucketKey(bucketStart, sample.metricName(), sample.dimensionHash());
                deltas.compute(key, (ignored, existing) -> {
                    if (existing == null) {
                        return new PerformanceMetricBucketDelta(applicationId, bucketStart, sample, now);
                    }
                    existing.add(sample);
                    return existing;
                });
            }
        }
        deltas.values().forEach(mapper::upsertBucket);
        long lastEventId = events.get(events.size() - 1).getId();
        mapper.updateCheckpoint(applicationId, lastEventId, now);
        return events.size();
    }

    private record BucketKey(long bucketStart, String metricName, String dimensionHash) {
    }
}
