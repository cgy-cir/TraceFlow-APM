package io.traceflow.performance;

import java.math.BigDecimal;

public enum HistogramKind {
    TIMING_MS_V1("100", "200", "300", "500", "800", "1000", "1500", "2000",
            "2500", "3000", "4000", "5000", "8000", "12000", "20000"),
    CLS_SCORE_V1("0.01", "0.025", "0.05", "0.075", "0.1", "0.15", "0.2", "0.25",
            "0.4", "0.6", "1"),
    SIZE_BYTES_V1("1024", "4096", "16384", "65536", "262144", "1048576", "4194304", "16777216");

    private final BigDecimal[] upperBounds;

    HistogramKind(String... upperBounds) {
        this.upperBounds = java.util.Arrays.stream(upperBounds).map(BigDecimal::new).toArray(BigDecimal[]::new);
    }

    public int bucketIndex(BigDecimal value) {
        for (int index = 0; index < upperBounds.length; index++) {
            if (value.compareTo(upperBounds[index]) <= 0) return index;
        }
        return upperBounds.length;
    }

    public static HistogramKind forMetric(String metricName, String unit) {
        if ("score".equals(unit) && "CLS".equals(metricName)) return CLS_SCORE_V1;
        if ("bytes".equals(unit)) return SIZE_BYTES_V1;
        if ("ms".equals(unit)) return TIMING_MS_V1;
        throw new IllegalArgumentException("Unsupported metric unit: " + unit);
    }
}
