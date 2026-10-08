package io.traceflow.performance;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class HistogramKindTests {
    @Test
    void placesTimingBoundaryValuesInTheLowerBucket() {
        assertThat(HistogramKind.TIMING_MS_V1.bucketIndex(new BigDecimal("100"))).isZero();
        assertThat(HistogramKind.TIMING_MS_V1.bucketIndex(new BigDecimal("100.0001"))).isEqualTo(1);
        assertThat(HistogramKind.TIMING_MS_V1.bucketIndex(new BigDecimal("20000"))).isEqualTo(14);
        assertThat(HistogramKind.TIMING_MS_V1.bucketIndex(new BigDecimal("20000.1"))).isEqualTo(15);
    }

    @Test
    void usesDedicatedClsAndSizeHistograms() {
        assertThat(HistogramKind.CLS_SCORE_V1.bucketIndex(new BigDecimal("0.1"))).isEqualTo(4);
        assertThat(HistogramKind.CLS_SCORE_V1.bucketIndex(new BigDecimal("1.1"))).isEqualTo(11);
        assertThat(HistogramKind.SIZE_BYTES_V1.bucketIndex(new BigDecimal("1024"))).isZero();
        assertThat(HistogramKind.SIZE_BYTES_V1.bucketIndex(new BigDecimal("16777217"))).isEqualTo(8);
    }
}
