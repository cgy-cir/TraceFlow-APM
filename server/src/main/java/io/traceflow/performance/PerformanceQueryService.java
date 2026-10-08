package io.traceflow.performance;

import io.traceflow.event.EventApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class PerformanceQueryService {
    static final long HOUR_MS = 60 * 60 * 1000L;
    static final long DAY_MS = 24 * HOUR_MS;
    private static final long MAX_RANGE_MS = 90 * DAY_MS;
    private static final Set<String> DEVICE_TYPES = Set.of("desktop", "mobile", "tablet", "unknown");
    private static final List<String> CORE_METRICS = List.of("LCP", "INP", "CLS");
    private static final List<String> DEFAULT_METRICS = List.of("LCP", "INP", "CLS", "FCP", "TTFB");
    private static final Set<String> METRICS = Set.of(
            "LCP", "INP", "CLS", "FCP", "TTFB",
            "NAV_DNS", "NAV_TCP", "NAV_TLS", "NAV_REQUEST", "NAV_RESPONSE",
            "NAV_DOM_INTERACTIVE", "NAV_DCL", "NAV_LOAD",
            "RESOURCE_DURATION", "RESOURCE_TRANSFER_SIZE");

    private final PerformanceQueryMapper mapper;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final int lowSampleThreshold;

    @Autowired
    public PerformanceQueryService(PerformanceQueryMapper mapper, ObjectMapper objectMapper,
                                   @Value("${traceflow.performance.low-sample-threshold:20}") int lowSampleThreshold) {
        this(mapper, objectMapper, Clock.systemUTC(), lowSampleThreshold);
    }

    PerformanceQueryService(PerformanceQueryMapper mapper, ObjectMapper objectMapper, Clock clock,
                            int lowSampleThreshold) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.lowSampleThreshold = Math.max(1, lowSampleThreshold);
    }

    public SummaryResponse summary(QueryFilter filter, List<String> requestedMetrics) {
        QueryFilter valid = validate(filter);
        List<String> metrics = validateMetrics(requestedMetrics, DEFAULT_METRICS);
        Map<String, Aggregate> aggregates = aggregate(load(valid, metrics), valid, row -> row.metricName());
        List<MetricSummary> items = metrics.stream()
                .map(metric -> aggregates.containsKey(metric)
                        ? aggregates.get(metric).summary()
                        : emptySummary(metric))
                .toList();
        return new SummaryResponse(valid.from(), valid.to(), items, "fixed_histogram_v1");
    }

    public TrendsResponse trends(QueryFilter filter, List<String> requestedMetrics, String interval) {
        QueryFilter valid = validate(filter);
        List<String> metrics = validateMetrics(requestedMetrics, CORE_METRICS);
        long step = switch (interval) {
            case "hour" -> HOUR_MS;
            case "day" -> DAY_MS;
            default -> throw invalid("interval must be hour or day");
        };
        List<PerformanceBucketRow> rows = load(valid, metrics);
        Map<String, Map<Long, Aggregate>> grouped = new LinkedHashMap<>();
        for (String metric : metrics) grouped.put(metric, new LinkedHashMap<>());
        for (PerformanceBucketRow row : rows) {
            if (!matches(row, valid)) continue;
            long timestamp = Math.floorDiv(row.bucketStart(), step) * step;
            grouped.get(row.metricName()).computeIfAbsent(timestamp, ignored -> new Aggregate()).merge(row);
        }

        long first = Math.floorDiv(valid.from(), step) * step;
        long last = Math.floorDiv(valid.to(), step) * step;
        List<TrendSeries> series = new ArrayList<>();
        for (String metric : metrics) {
            List<TrendPoint> points = new ArrayList<>();
            String unit = unitFor(metric);
            for (long timestamp = first; timestamp <= last; timestamp += step) {
                Aggregate aggregate = grouped.get(metric).get(timestamp);
                points.add(aggregate == null
                        ? new TrendPoint(timestamp, 0, null, null, null)
                        : aggregate.point(timestamp));
            }
            series.add(new TrendSeries(metric, unit, points));
        }
        return new TrendsResponse(valid.from(), valid.to(), interval, series, "fixed_histogram_v1");
    }

    public PagesResponse pages(QueryFilter filter, int requestedLimit) {
        QueryFilter valid = validate(filter);
        int limit = Math.min(100, Math.max(1, requestedLimit));
        List<PerformanceBucketRow> rows = load(valid, CORE_METRICS);
        Map<String, Map<String, Aggregate>> pages = new LinkedHashMap<>();
        for (PerformanceBucketRow row : rows) {
            JsonNode dimensions = dimensions(row);
            if (!matches(dimensions, valid)) continue;
            String pagePath = dimensions.path("pagePath").asText("");
            if (pagePath.isBlank()) continue;
            pages.computeIfAbsent(pagePath, ignored -> new LinkedHashMap<>())
                    .computeIfAbsent(row.metricName(), ignored -> new Aggregate()).merge(row);
        }
        List<PageSummary> items = pages.entrySet().stream()
                .map(entry -> pageSummary(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(PageSummary::lowSample)
                        .thenComparing(this::worstScore, Comparator.reverseOrder())
                        .thenComparing(PageSummary::sampleCount, Comparator.reverseOrder())
                        .thenComparing(PageSummary::pagePath))
                .limit(limit)
                .toList();
        return new PagesResponse(valid.from(), valid.to(), items, lowSampleThreshold, "fixed_histogram_v1");
    }

    public ResourcesResponse resources(long applicationId, Long from, Long to, String environment, String release,
                                       String pagePath, String deviceType, int requestedLimit) {
        long effectiveTo = to == null ? clock.millis() : to;
        long effectiveFrom = from == null ? Math.max(0, effectiveTo - DAY_MS) : from;
        QueryFilter valid = validate(new QueryFilter(applicationId, effectiveFrom, effectiveTo,
                environment, release, pagePath, deviceType));
        int limit = Math.min(100, Math.max(1, requestedLimit));
        List<ResourceDetail> items = mapper.findSlowResources(applicationId, valid.from(), valid.to(),
                        valid.environment(), valid.release(), valid.pagePath(), valid.deviceType(), limit)
                .stream().map(this::resourceDetail).toList();
        return new ResourcesResponse(valid.from(), valid.to(), items);
    }

    public OverviewResponse overview(QueryFilter filter) {
        QueryFilter valid = validate(filter);
        SummaryResponse summary = summary(valid, CORE_METRICS);
        PagesResponse pages = pages(valid, 5);
        long sampleCount = summary.metrics().stream().mapToLong(MetricSummary::sampleCount).sum();
        long errorCount = mapper.countEvents(valid.applicationId(), "error", null, valid.from(), valid.to(),
                valid.environment(), valid.release(), valid.pagePath(), valid.deviceType());
        long httpCount = mapper.countEvents(valid.applicationId(), "http", null, valid.from(), valid.to(),
                valid.environment(), valid.release(), valid.pagePath(), valid.deviceType());
        long failedHttpCount = mapper.countEvents(valid.applicationId(), "http", "failure", valid.from(), valid.to(),
                valid.environment(), valid.release(), valid.pagePath(), valid.deviceType());
        return new OverviewResponse(valid.from(), valid.to(), summary.metrics(), sampleCount,
                errorCount, httpCount, failedHttpCount, pages.items(), "fixed_histogram_v1");
    }

    private List<PerformanceBucketRow> load(QueryFilter filter, List<String> metrics) {
        long fromBucket = Math.floorDiv(filter.from(), HOUR_MS) * HOUR_MS;
        long toBucket = Math.floorDiv(filter.to(), HOUR_MS) * HOUR_MS;
        return mapper.findBuckets(filter.applicationId(), fromBucket, toBucket, metrics);
    }

    private Map<String, Aggregate> aggregate(List<PerformanceBucketRow> rows, QueryFilter filter,
                                             java.util.function.Function<PerformanceBucketRow, String> key) {
        Map<String, Aggregate> result = new LinkedHashMap<>();
        for (PerformanceBucketRow row : rows) {
            if (matches(row, filter)) result.computeIfAbsent(key.apply(row), ignored -> new Aggregate()).merge(row);
        }
        return result;
    }

    private boolean matches(PerformanceBucketRow row, QueryFilter filter) {
        return matches(dimensions(row), filter);
    }

    private boolean matches(JsonNode dimensions, QueryFilter filter) {
        return dimensionMatches(dimensions, "environment", filter.environment())
                && dimensionMatches(dimensions, "release", filter.release())
                && dimensionMatches(dimensions, "pagePath", filter.pagePath())
                && dimensionMatches(dimensions, "deviceType", filter.deviceType());
    }

    private boolean dimensionMatches(JsonNode dimensions, String field, String expected) {
        return expected == null || expected.equals(dimensions.path(field).asText(""));
    }

    private JsonNode dimensions(PerformanceBucketRow row) {
        JsonNode dimensions = objectMapper.readTree(row.dimensions());
        if (dimensions == null || !dimensions.isObject()) {
            throw new IllegalStateException("Performance bucket has invalid dimensions: " + row.metricName());
        }
        return dimensions;
    }

    private PageSummary pageSummary(String pagePath, Map<String, Aggregate> metrics) {
        Aggregate lcp = metrics.get("LCP");
        Aggregate inp = metrics.get("INP");
        Aggregate cls = metrics.get("CLS");
        long sampleCount = metrics.values().stream().mapToLong(item -> item.sampleCount).max().orElse(0);
        long rated = metrics.values().stream().mapToLong(Aggregate::ratedCount).sum();
        long poor = metrics.values().stream().mapToLong(item -> item.poorCount).sum();
        BigDecimal poorRate = rated == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(poor).divide(BigDecimal.valueOf(rated), 4, RoundingMode.HALF_UP);
        return new PageSummary(pagePath, sampleCount, percentile(lcp, 0.75), percentile(inp, 0.75),
                percentile(cls, 0.75), poorRate, sampleCount < lowSampleThreshold);
    }

    private BigDecimal worstScore(PageSummary page) {
        return max(score(page.lcpP75(), "2500"), score(page.inpP75(), "200"), score(page.clsP75(), "0.1"));
    }

    private BigDecimal score(BigDecimal p75, String goodThreshold) {
        return p75 == null ? BigDecimal.valueOf(-1)
                : p75.divide(new BigDecimal(goodThreshold), 4, RoundingMode.HALF_UP);
    }

    private BigDecimal max(BigDecimal... values) {
        BigDecimal result = values[0];
        for (int index = 1; index < values.length; index++) result = result.max(values[index]);
        return result;
    }

    private BigDecimal percentile(Aggregate aggregate, double percentile) {
        return aggregate == null ? null : aggregate.percentile(percentile);
    }

    private ResourceDetail resourceDetail(ResourceEventRow row) {
        JsonNode payload = objectMapper.readTree(row.payload());
        boolean sizeAvailable = payload.path("sizeAvailable").asBoolean(false);
        return new ResourceDetail(row.id(), row.eventId(), row.occurredAt(), row.environment(), row.releaseName(),
                row.pageUrl(), row.pagePath(), row.resourceUrl(), row.resourceType(), row.resourceDurationMs(),
                sizeAvailable ? nullableLong(payload.get("transferSize")) : null,
                sizeAvailable ? nullableLong(payload.get("encodedBodySize")) : null,
                sizeAvailable ? nullableLong(payload.get("decodedBodySize")) : null,
                textOrNull(payload.get("nextHopProtocol")), textOrNull(payload.get("renderBlockingStatus")));
    }

    private Long nullableLong(JsonNode node) {
        return node != null && node.isIntegralNumber() ? node.longValue() : null;
    }

    private String textOrNull(JsonNode node) {
        return node != null && node.isTextual() ? node.asText() : null;
    }

    private QueryFilter validate(QueryFilter filter) {
        if (filter.applicationId() <= 0) throw invalid("applicationId must be positive");
        if (filter.from() < 0 || filter.to() < 0 || filter.from() > filter.to()) {
            throw invalid("time range is invalid");
        }
        if (filter.to() - filter.from() > MAX_RANGE_MS) throw invalid("time range must not exceed 90 days");
        String deviceType = blankToNull(filter.deviceType());
        if (deviceType != null && !DEVICE_TYPES.contains(deviceType)) throw invalid("deviceType is invalid");
        return new QueryFilter(filter.applicationId(), filter.from(), filter.to(),
                checkedFilter(filter.environment(), "environment"), checkedFilter(filter.release(), "release"),
                checkedFilter(filter.pagePath(), "pagePath"), deviceType);
    }

    private String checkedFilter(String value, String name) {
        String normalized = blankToNull(value);
        if (normalized != null && normalized.length() > 500) throw invalid(name + " is too long");
        return normalized;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private List<String> validateMetrics(List<String> requested, List<String> defaults) {
        if (requested == null || requested.isEmpty()) return defaults;
        LinkedHashSet<String> metrics = new LinkedHashSet<>();
        for (String item : requested) {
            if (item == null) continue;
            for (String metric : item.split(",")) {
                String normalized = metric.trim().toUpperCase(java.util.Locale.ROOT);
                if (!METRICS.contains(normalized)) throw invalid("metric is invalid: " + metric);
                metrics.add(normalized);
            }
        }
        if (metrics.isEmpty()) throw invalid("at least one metric is required");
        if (metrics.size() > 10) throw invalid("metrics must not contain more than 10 values");
        return List.copyOf(metrics);
    }

    private String unitFor(String metric) {
        if ("CLS".equals(metric)) return "score";
        if ("RESOURCE_TRANSFER_SIZE".equals(metric)) return "bytes";
        return "ms";
    }

    private MetricSummary emptySummary(String metric) {
        return new MetricSummary(metric, unitFor(metric), 0, null, null, null,
                new RatingCounts(0, 0, 0), "fixed_histogram_v1");
    }

    private EventApiException invalid(String message) {
        return new EventApiException(400, "INVALID_PERFORMANCE_QUERY", message);
    }

    private static final class Aggregate {
        private String metric;
        private String unit;
        private HistogramKind histogramKind;
        private long sampleCount;
        private BigDecimal sum = BigDecimal.ZERO;
        private BigDecimal min;
        private BigDecimal max;
        private long goodCount;
        private long needsImprovementCount;
        private long poorCount;
        private final long[] buckets = new long[16];

        void merge(PerformanceBucketRow row) {
            HistogramKind nextKind = HistogramKind.valueOf(row.histogramKind());
            if (metric != null && (!metric.equals(row.metricName()) || !unit.equals(row.metricUnit())
                    || histogramKind != nextKind)) {
                throw new IllegalStateException("Incompatible performance buckets cannot be merged");
            }
            metric = row.metricName();
            unit = row.metricUnit();
            histogramKind = nextKind;
            sampleCount += row.sampleCount();
            sum = sum.add(row.metricSum());
            min = min == null || row.metricMin().compareTo(min) < 0 ? row.metricMin() : min;
            max = max == null || row.metricMax().compareTo(max) > 0 ? row.metricMax() : max;
            goodCount += row.goodCount();
            needsImprovementCount += row.needsImprovementCount();
            poorCount += row.poorCount();
            long[] nextBuckets = row.histogram();
            for (int index = 0; index < buckets.length; index++) buckets[index] += nextBuckets[index];
        }

        long ratedCount() {
            return goodCount + needsImprovementCount + poorCount;
        }

        BigDecimal percentile(double percentile) {
            if (sampleCount == 0) return null;
            long rank = (long) Math.ceil(sampleCount * percentile);
            long cumulative = 0;
            for (int index = 0; index < buckets.length; index++) {
                cumulative += buckets[index];
                if (cumulative >= rank) {
                    BigDecimal upperBound = histogramKind.upperBound(index);
                    return upperBound == null ? max : upperBound;
                }
            }
            return max;
        }

        BigDecimal average() {
            return sampleCount == 0 ? null
                    : sum.divide(BigDecimal.valueOf(sampleCount), 4, RoundingMode.HALF_UP).stripTrailingZeros();
        }

        MetricSummary summary() {
            return new MetricSummary(metric, unit, sampleCount, percentile(0.75), percentile(0.95), average(),
                    new RatingCounts(goodCount, needsImprovementCount, poorCount), "fixed_histogram_v1");
        }

        TrendPoint point(long timestamp) {
            return new TrendPoint(timestamp, sampleCount, percentile(0.75), percentile(0.95), average());
        }
    }

    public record QueryFilter(long applicationId, long from, long to, String environment, String release,
                              String pagePath, String deviceType) {
    }

    public record RatingCounts(long good, long needsImprovement, long poor) {
    }

    public record MetricSummary(String metric, String unit, long sampleCount, BigDecimal p75, BigDecimal p95,
                                BigDecimal average, RatingCounts ratings, String percentileMethod) {
    }

    public record SummaryResponse(long from, long to, List<MetricSummary> metrics, String percentileMethod) {
    }

    public record TrendPoint(long timestamp, long sampleCount, BigDecimal p75, BigDecimal p95,
                             BigDecimal average) {
    }

    public record TrendSeries(String metric, String unit, List<TrendPoint> points) {
    }

    public record TrendsResponse(long from, long to, String interval, List<TrendSeries> series,
                                 String percentileMethod) {
    }

    public record PageSummary(String pagePath, long sampleCount, BigDecimal lcpP75, BigDecimal inpP75,
                              BigDecimal clsP75, BigDecimal poorRate, boolean lowSample) {
    }

    public record PagesResponse(long from, long to, List<PageSummary> items, int lowSampleThreshold,
                                String percentileMethod) {
    }

    public record ResourceDetail(long id, String eventId, long occurredAt, String environment, String release,
                                 String pageUrl, String pagePath, String url, String resourceType,
                                 BigDecimal durationMs, Long transferSize, Long encodedBodySize,
                                 Long decodedBodySize, String nextHopProtocol, String renderBlockingStatus) {
    }

    public record ResourcesResponse(long from, long to, List<ResourceDetail> items) {
    }

    public record OverviewResponse(long from, long to, List<MetricSummary> coreWebVitals,
                                   long performanceSampleCount, long errorEventCount, long httpEventCount,
                                   long failedHttpEventCount, List<PageSummary> worstPages,
                                   String percentileMethod) {
    }
}
