package io.traceflow.performance;

import io.traceflow.performance.PerformanceEventProjector.MetricSample;

import java.math.BigDecimal;

public class PerformanceMetricBucketDelta {
    private final long applicationId;
    private final long bucketStart;
    private final String metricName;
    private final String metricUnit;
    private final String dimensionHash;
    private final String dimensions;
    private final String histogramKind;
    private final long[] buckets = new long[16];
    private long sampleCount;
    private BigDecimal metricSum = BigDecimal.ZERO;
    private BigDecimal metricMin;
    private BigDecimal metricMax;
    private long goodCount;
    private long needsImprovementCount;
    private long poorCount;
    private long now;

    public PerformanceMetricBucketDelta(long applicationId, long bucketStart, MetricSample sample, long now) {
        this.applicationId = applicationId;
        this.bucketStart = bucketStart;
        this.metricName = sample.metricName();
        this.metricUnit = sample.unit();
        this.dimensionHash = sample.dimensionHash();
        this.dimensions = sample.dimensions();
        this.histogramKind = sample.histogramKind().name();
        this.now = now;
        add(sample);
    }

    public void add(MetricSample sample) {
        if (!metricName.equals(sample.metricName()) || !metricUnit.equals(sample.unit())
                || !dimensionHash.equals(sample.dimensionHash()) || !histogramKind.equals(sample.histogramKind().name())) {
            throw new IllegalArgumentException("Metric sample does not match bucket identity");
        }
        BigDecimal value = sample.value();
        sampleCount++;
        metricSum = metricSum.add(value);
        metricMin = metricMin == null || value.compareTo(metricMin) < 0 ? value : metricMin;
        metricMax = metricMax == null || value.compareTo(metricMax) > 0 ? value : metricMax;
        buckets[sample.histogramKind().bucketIndex(value)]++;
        if ("good".equals(sample.rating())) goodCount++;
        else if ("needs-improvement".equals(sample.rating())) needsImprovementCount++;
        else if ("poor".equals(sample.rating())) poorCount++;
    }

    public long getApplicationId() { return applicationId; }
    public long getBucketStart() { return bucketStart; }
    public String getMetricName() { return metricName; }
    public String getMetricUnit() { return metricUnit; }
    public String getDimensionHash() { return dimensionHash; }
    public String getDimensions() { return dimensions; }
    public String getHistogramKind() { return histogramKind; }
    public long getSampleCount() { return sampleCount; }
    public BigDecimal getMetricSum() { return metricSum; }
    public BigDecimal getMetricMin() { return metricMin; }
    public BigDecimal getMetricMax() { return metricMax; }
    public long getGoodCount() { return goodCount; }
    public long getNeedsImprovementCount() { return needsImprovementCount; }
    public long getPoorCount() { return poorCount; }
    public long getNow() { return now; }
    public long getBucket00() { return buckets[0]; }
    public long getBucket01() { return buckets[1]; }
    public long getBucket02() { return buckets[2]; }
    public long getBucket03() { return buckets[3]; }
    public long getBucket04() { return buckets[4]; }
    public long getBucket05() { return buckets[5]; }
    public long getBucket06() { return buckets[6]; }
    public long getBucket07() { return buckets[7]; }
    public long getBucket08() { return buckets[8]; }
    public long getBucket09() { return buckets[9]; }
    public long getBucket10() { return buckets[10]; }
    public long getBucket11() { return buckets[11]; }
    public long getBucket12() { return buckets[12]; }
    public long getBucket13() { return buckets[13]; }
    public long getBucket14() { return buckets[14]; }
    public long getBucket15() { return buckets[15]; }
}
