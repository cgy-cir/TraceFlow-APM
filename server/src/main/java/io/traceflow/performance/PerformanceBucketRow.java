package io.traceflow.performance;

import java.math.BigDecimal;

public record PerformanceBucketRow(
        long bucketStart,
        String metricName,
        String metricUnit,
        String dimensions,
        long sampleCount,
        BigDecimal metricSum,
        BigDecimal metricMin,
        BigDecimal metricMax,
        long goodCount,
        long needsImprovementCount,
        long poorCount,
        String histogramKind,
        long bucket00,
        long bucket01,
        long bucket02,
        long bucket03,
        long bucket04,
        long bucket05,
        long bucket06,
        long bucket07,
        long bucket08,
        long bucket09,
        long bucket10,
        long bucket11,
        long bucket12,
        long bucket13,
        long bucket14,
        long bucket15) {

    public long[] histogram() {
        return new long[]{bucket00, bucket01, bucket02, bucket03, bucket04, bucket05, bucket06, bucket07,
                bucket08, bucket09, bucket10, bucket11, bucket12, bucket13, bucket14, bucket15};
    }
}
