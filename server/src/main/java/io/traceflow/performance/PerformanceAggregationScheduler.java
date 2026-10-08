package io.traceflow.performance;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "traceflow.performance.aggregation-enabled", havingValue = "true", matchIfMissing = true)
public class PerformanceAggregationScheduler {
    private static final Logger log = LoggerFactory.getLogger(PerformanceAggregationScheduler.class);

    private final PerformanceAggregationMapper mapper;
    private final PerformanceAggregationWorker worker;

    public PerformanceAggregationScheduler(PerformanceAggregationMapper mapper, PerformanceAggregationWorker worker) {
        this.mapper = mapper;
        this.worker = worker;
    }

    @Scheduled(fixedDelayString = "${traceflow.performance.aggregation-delay-ms:10000}")
    public void aggregate() {
        for (Long applicationId : mapper.findActiveApplicationIds()) {
            try {
                int processed = worker.aggregateNextBatch(applicationId);
                if (processed > 0) log.info("Aggregated performance events: applicationId={}, processed={}",
                        applicationId, processed);
            } catch (RuntimeException exception) {
                log.error("Performance aggregation failed: applicationId={}", applicationId, exception);
            }
        }
    }
}
