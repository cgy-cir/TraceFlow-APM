package io.traceflow.event;

import io.traceflow.event.EventBatchRequest.TraceEventRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Component
public class EventValidationService {
    private static final long MAX_FUTURE_MS = 5 * 60 * 1000L;
    private static final long MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000L;
    private static final BigDecimal MAX_METRIC_VALUE = new BigDecimal("999999999999.9999");
    private static final BigDecimal MAX_RESOURCE_DURATION = new BigDecimal("999999999.999");
    private static final BigDecimal MAX_SAFE_INTEGER = new BigDecimal("9007199254740991");
    private static final Set<String> TYPES = Set.of("page_view", "error", "http", "performance", "resource");
    private static final Set<String> ERROR_MECHANISMS = Set.of("onerror", "unhandledrejection", "resource", "manual");
    private static final Set<String> HTTP_TRANSPORTS = Set.of("fetch", "xhr");
    private static final Set<String> HTTP_OUTCOMES = Set.of("success", "failure", "aborted");
    private static final Set<String> BREADCRUMB_CATEGORIES = Set.of("navigation", "ui.click", "http", "console", "custom");
    private static final Set<String> BREADCRUMB_LEVELS = Set.of("debug", "info", "warning", "error");
    private static final Set<String> WEB_VITAL_NAMES = Set.of("LCP", "CLS", "INP", "FCP", "TTFB");
    private static final Set<String> METRIC_RATINGS = Set.of("good", "needs-improvement", "poor");
    private static final Set<String> WEB_VITAL_NAVIGATION_TYPES = Set.of(
            "navigate", "reload", "back-forward", "back-forward-cache", "prerender", "restore",
            "soft-navigation", "other");
    private static final Set<String> DOCUMENT_NAVIGATION_TYPES = Set.of(
            "navigate", "reload", "back-forward", "prerender", "other");
    private static final Set<String> WEB_VITAL_FIELDS = Set.of(
            "kind", "metricName", "measurementId", "value", "delta", "unit", "rating",
            "navigationType", "attribution");
    private static final Set<String> NAVIGATION_FIELDS = Set.of(
            "kind", "navigationType", "redirectCount", "dns", "tcp", "tls", "request", "response",
            "domInteractive", "domContentLoaded", "load", "transferSize", "encodedBodySize", "decodedBodySize");
    private static final Set<String> RESOURCE_FIELDS = Set.of(
            "url", "initiatorType", "startTime", "duration", "transferSize", "encodedBodySize",
            "decodedBodySize", "sizeAvailable", "nextHopProtocol", "renderBlockingStatus");
    private static final Set<String> ATTRIBUTION_FIELDS = Set.of(
            "target", "resourceUrl", "interactionType", "timeToFirstByte", "resourceLoadDelay",
            "resourceLoadDuration", "elementRenderDelay", "largestShiftTime", "largestShiftValue",
            "inputDelay", "processingDuration", "presentationDelay");
    private static final Map<String, Set<String>> ATTRIBUTION_FIELDS_BY_METRIC = Map.of(
            "LCP", Set.of("target", "resourceUrl", "timeToFirstByte", "resourceLoadDelay",
                    "resourceLoadDuration", "elementRenderDelay"),
            "CLS", Set.of("target", "largestShiftTime", "largestShiftValue"),
            "INP", Set.of("target", "interactionType", "inputDelay", "processingDuration", "presentationDelay"),
            "FCP", Set.of("timeToFirstByte"),
            "TTFB", Set.of());

    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public EventValidationService(ObjectMapper objectMapper) {
        this(objectMapper, Clock.systemUTC());
    }

    EventValidationService(ObjectMapper objectMapper, Clock clock) {
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public ValidationResult validate(TraceEventRequest event) {
        if (event == null) return invalid(null, "INVALID_PAYLOAD", "event is required");
        if (!isUuidV4(event.eventId())) return invalid(event.eventId(), "INVALID_EVENT_ID", "eventId must be a UUID v4");
        if (!TYPES.contains(event.type())) return invalid(event.eventId(), "INVALID_TYPE", "type is not supported");
        if (!isUuidV4(event.sessionId())) return invalid(event.eventId(), "INVALID_PAYLOAD", "sessionId must be a UUID v4");
        if (isBlank(event.environment()) || tooLong(event.environment(), 40)) return invalid(event.eventId(), "INVALID_PAYLOAD", "environment is required and must not exceed 40 characters");
        if (tooLong(event.anonymousId(), 64) || tooLong(event.release(), 100) || tooLong(event.traceId(), 64)) return invalid(event.eventId(), "INVALID_PAYLOAD", "optional context field exceeds its limit");
        if (event.timestamp() == null || event.timestamp() <= 0) return invalid(event.eventId(), "INVALID_TIMESTAMP", "timestamp must be a positive epoch millisecond value");
        long now = clock.millis();
        if (event.timestamp() > now + MAX_FUTURE_MS || event.timestamp() < now - MAX_PAST_MS) return invalid(event.eventId(), "INVALID_TIMESTAMP", "timestamp is outside the accepted range");
        if (event.page() == null || !isHttpUrl(event.page().url()) || isBlank(event.page().path())) return invalid(event.eventId(), "INVALID_PAYLOAD", "page.url and page.path are required");
        if (tooLong(event.page().url(), 2048) || tooLong(event.page().path(), 1024) || tooLong(event.page().referrer(), 2048)) return invalid(event.eventId(), "INVALID_PAYLOAD", "page field exceeds its limit");
        if (event.user() != null && (isBlank(event.user().id()) || tooLong(event.user().id(), 100))) return invalid(event.eventId(), "INVALID_PAYLOAD", "user.id must not exceed 100 characters");
        if (!validDimensions(event)) return invalid(event.eventId(), "INVALID_PAYLOAD", "device dimensions must be integers from 0 to 20000");
        if (event.tags() != null && event.tags().size() > 20) return invalid(event.eventId(), "INVALID_PAYLOAD", "tags must not contain more than 20 items");
        if (!validBreadcrumbs(event.breadcrumbs())) return invalid(event.eventId(), "INVALID_PAYLOAD", "breadcrumbs are invalid or contain more than 50 items");
        if (event.payload() == null) return invalid(event.eventId(), "INVALID_PAYLOAD", "payload is required");
        if (objectMapper.writeValueAsBytes(event).length > 64 * 1024) return invalid(event.eventId(), "EVENT_TOO_LARGE", "event exceeds 64 KiB");
        return switch (event.type()) {
            case "page_view" -> validatePageView(event);
            case "error" -> validateError(event);
            case "http" -> validateHttp(event);
            case "performance" -> validatePerformance(event);
            case "resource" -> validateResource(event);
            default -> invalid(event.eventId(), "INVALID_TYPE", "unsupported event type");
        };
    }

    private ValidationResult validatePageView(TraceEventRequest event) {
        PageViewPayload payload = objectMapper.convertValue(event.payload(), PageViewPayload.class);
        if (payload == null || !Set.of("initial", "push", "replace", "pop").contains(payload.navigationType()) || isBlank(payload.to())) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "page_view payload requires navigationType and to");
        }
        return ValidationResult.valid(payload);
    }

    private ValidationResult validateError(TraceEventRequest event) {
        ErrorPayload payload = objectMapper.convertValue(event.payload(), ErrorPayload.class);
        if (payload == null || !ERROR_MECHANISMS.contains(payload.mechanism()) || isBlank(payload.name()) || isBlank(payload.message())) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "error payload requires mechanism, name, and message");
        }
        if (tooLong(payload.name(), 100) || tooLong(payload.message(), 2000) || tooLong(payload.stack(), 32 * 1024)
                || tooLong(payload.filename(), 2048) || negative(payload.lineno()) || negative(payload.colno())) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "error payload field exceeds its limit");
        }
        return ValidationResult.valid(payload);
    }

    private ValidationResult validateHttp(TraceEventRequest event) {
        HttpPayload payload = objectMapper.convertValue(event.payload(), HttpPayload.class);
        if (payload == null || !HTTP_TRANSPORTS.contains(payload.transport()) || isBlank(payload.method())
                || payload.method().length() > 16 || !isHttpUrl(payload.url()) || !HTTP_OUTCOMES.contains(payload.outcome())
                || payload.duration() == null || !Double.isFinite(payload.duration()) || payload.duration() < 0) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "http payload is invalid");
        }
        if (payload.status() != null && (payload.status() < 100 || payload.status() > 599)) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "http status must be between 100 and 599");
        }
        return ValidationResult.valid(payload);
    }

    private ValidationResult validatePerformance(TraceEventRequest event) {
        if (event.breadcrumbs() != null) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "performance events must not contain breadcrumbs");
        }
        Object kind = event.payload().get("kind");
        try {
            if ("web_vital".equals(kind)) return validateWebVital(event);
            if ("navigation".equals(kind)) return validateNavigation(event);
        } catch (IllegalArgumentException ignored) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "performance payload has invalid field types");
        }
        return invalid(event.eventId(), "INVALID_PAYLOAD", "performance kind must be web_vital or navigation");
    }

    private ValidationResult validateWebVital(TraceEventRequest event) {
        Map<String, Object> raw = event.payload();
        if (!WEB_VITAL_FIELDS.containsAll(raw.keySet())) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "web vital payload contains unsupported fields");
        }
        WebVitalPayload payload = objectMapper.convertValue(raw, WebVitalPayload.class);
        if (!WEB_VITAL_NAMES.contains(payload.metricName()) || isBlank(payload.measurementId())
                || tooLong(payload.measurementId(), 100) || !METRIC_RATINGS.contains(payload.rating())
                || !WEB_VITAL_NAVIGATION_TYPES.contains(payload.navigationType())
                || !validDecimal(raw.get("value"), MAX_METRIC_VALUE)
                || !validNonNegativeNumber(raw.get("delta"))) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "web vital payload is invalid");
        }
        String expectedUnit = "CLS".equals(payload.metricName()) ? "score" : "ms";
        if (!expectedUnit.equals(payload.unit())) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "web vital unit does not match metricName");
        }
        if (!validAttribution(raw.get("attribution"), payload.metricName())) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "web vital attribution is invalid");
        }
        return ValidationResult.valid(payload);
    }

    private ValidationResult validateNavigation(TraceEventRequest event) {
        Map<String, Object> raw = event.payload();
        if (!NAVIGATION_FIELDS.containsAll(raw.keySet())
                || !validInteger(raw.get("redirectCount"), BigDecimal.ZERO, new BigDecimal("100"))
                || !validNonNegativeNumbers(raw, "dns", "tcp", "tls", "request", "response",
                "domInteractive", "domContentLoaded", "load")
                || !validOptionalSafeIntegers(raw, "transferSize", "encodedBodySize", "decodedBodySize")) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "navigation payload is invalid");
        }
        NavigationTimingPayload payload = objectMapper.convertValue(raw, NavigationTimingPayload.class);
        if (!DOCUMENT_NAVIGATION_TYPES.contains(payload.navigationType())) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "navigationType is invalid");
        }
        return ValidationResult.valid(payload);
    }

    private ValidationResult validateResource(TraceEventRequest event) {
        if (event.breadcrumbs() != null) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "resource events must not contain breadcrumbs");
        }
        Map<String, Object> raw = event.payload();
        try {
            if (!RESOURCE_FIELDS.containsAll(raw.keySet()) || !isHttpUrl(asString(raw.get("url")))
                    || isBlank(asString(raw.get("initiatorType"))) || tooLong(asString(raw.get("initiatorType")), 40)
                    || !validNonNegativeNumber(raw.get("startTime"))
                    || !validDecimal(raw.get("duration"), MAX_RESOURCE_DURATION)
                    || !validOptionalSafeIntegers(raw, "transferSize", "encodedBodySize", "decodedBodySize")
                    || !(raw.get("sizeAvailable") instanceof Boolean)
                    || tooLong(asOptionalString(raw.get("nextHopProtocol")), 40)
                    || !validOptionalEnum(raw.get("renderBlockingStatus"), Set.of("blocking", "non-blocking"))) {
                return invalid(event.eventId(), "INVALID_PAYLOAD", "resource payload is invalid");
            }
            return ValidationResult.valid(objectMapper.convertValue(raw, ResourcePayload.class));
        } catch (IllegalArgumentException ignored) {
            return invalid(event.eventId(), "INVALID_PAYLOAD", "resource payload has invalid field types");
        }
    }

    private boolean validAttribution(Object value, String metricName) {
        if (value == null) return true;
        if (!(value instanceof Map<?, ?> attributes) || attributes.size() > 20) return false;
        Set<String> allowedForMetric = ATTRIBUTION_FIELDS_BY_METRIC.get(metricName);
        for (Map.Entry<?, ?> entry : attributes.entrySet()) {
            if (!(entry.getKey() instanceof String key) || !ATTRIBUTION_FIELDS.contains(key)
                    || !allowedForMetric.contains(key)) return false;
            Object fieldValue = entry.getValue();
            if (Set.of("target", "resourceUrl", "interactionType").contains(key)) {
                if (!(fieldValue instanceof String text) || text.isBlank()) return false;
                if ("target".equals(key) && text.length() > 256) return false;
                if ("interactionType".equals(key) && text.length() > 40) return false;
                if ("resourceUrl".equals(key) && (text.length() > 2048 || !isHttpUrl(text))) return false;
            } else if (!validNonNegativeNumber(fieldValue)) {
                return false;
            }
        }
        return true;
    }

    private boolean validNonNegativeNumbers(Map<String, Object> values, String... keys) {
        for (String key : keys) if (!validNonNegativeNumber(values.get(key))) return false;
        return true;
    }

    private boolean validOptionalSafeIntegers(Map<String, Object> values, String... keys) {
        for (String key : keys) {
            Object value = values.get(key);
            if (value != null && !validInteger(value, BigDecimal.ZERO, MAX_SAFE_INTEGER)) return false;
        }
        return true;
    }

    private boolean validNonNegativeNumber(Object value) {
        return validDecimal(value, null);
    }

    private boolean validDecimal(Object value, BigDecimal max) {
        if (!(value instanceof Number number)) return false;
        try {
            BigDecimal decimal = new BigDecimal(number.toString());
            return Double.isFinite(number.doubleValue())
                    && decimal.signum() >= 0
                    && (max == null || decimal.compareTo(max) <= 0);
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private boolean validInteger(Object value, BigDecimal min, BigDecimal max) {
        if (!(value instanceof Number number)) return false;
        try {
            BigDecimal decimal = new BigDecimal(number.toString()).stripTrailingZeros();
            return decimal.scale() <= 0 && decimal.compareTo(min) >= 0 && decimal.compareTo(max) <= 0;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private boolean validOptionalEnum(Object value, Set<String> values) {
        return value == null || value instanceof String text && values.contains(text);
    }

    private String asString(Object value) {
        if (!(value instanceof String text)) throw new IllegalArgumentException("value must be a string");
        return text;
    }

    private String asOptionalString(Object value) {
        if (value == null) return null;
        return asString(value);
    }

    private boolean validDimensions(TraceEventRequest event) {
        if (event.device() == null) return true;
        return Arrays.stream(new Integer[]{event.device().screenWidth(), event.device().screenHeight(),
                        event.device().viewportWidth(), event.device().viewportHeight()})
                .allMatch(value -> value == null || value >= 0 && value <= 20000);
    }

    private boolean validBreadcrumbs(List<Map<String, Object>> breadcrumbs) {
        if (breadcrumbs == null) return true;
        if (breadcrumbs.size() > 50) return false;
        for (Map<String, Object> breadcrumb : breadcrumbs) {
            if (breadcrumb == null || !(breadcrumb.get("timestamp") instanceof Number timestamp)
                    || timestamp.longValue() <= 0
                    || !BREADCRUMB_CATEGORIES.contains(String.valueOf(breadcrumb.get("category")))
                    || !BREADCRUMB_LEVELS.contains(String.valueOf(breadcrumb.get("level")))) return false;
            Object message = breadcrumb.get("message");
            if (message != null && (!(message instanceof String) || ((String) message).length() > 500)) return false;
            Object data = breadcrumb.get("data");
            if (data == null) continue;
            if (!(data instanceof Map<?, ?> values) || values.size() > 20) return false;
            if (values.entrySet().stream().anyMatch(entry -> !(entry.getKey() instanceof String)
                    || !isBreadcrumbValue(entry.getValue()))) return false;
        }
        return true;
    }

    private boolean isBreadcrumbValue(Object value) {
        return value == null || value instanceof String || value instanceof Number || value instanceof Boolean;
    }

    private boolean isHttpUrl(String value) {
        if (isBlank(value)) return false;
        try {
            String scheme = URI.create(value).getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private boolean isUuidV4(String value) {
        try {
            UUID uuid = UUID.fromString(value);
            return uuid.version() == 4 && uuid.toString().equals(value);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private ValidationResult invalid(String eventId, String code, String message) {
        return ValidationResult.invalid(eventId, code, message);
    }

    private boolean isBlank(String value) { return value == null || value.isBlank(); }
    private boolean tooLong(String value, int max) { return value != null && value.length() > max; }
    private boolean negative(Integer value) { return value != null && value < 0; }

    public record ValidationResult(boolean valid, String eventId, String code, String message, Object typedPayload) {
        static ValidationResult valid(Object payload) { return new ValidationResult(true, null, null, null, payload); }
        static ValidationResult invalid(String eventId, String code, String message) { return new ValidationResult(false, eventId, code, message, null); }
    }

    public record PageViewPayload(String navigationType, String from, String to) {
    }

    public record ErrorPayload(String mechanism, String name, String message, String stack, String filename,
                               Integer lineno, Integer colno, Boolean handled, String resourceType) {
    }

    public record HttpPayload(String transport, String method, String url, Integer status, Double duration,
                              String outcome, String errorMessage, Long requestSize, Long responseSize) {
    }

    public record WebVitalPayload(String kind, String metricName, String measurementId, Double value, Double delta,
                                  String unit, String rating, String navigationType,
                                  WebVitalAttribution attribution) {
    }

    public record WebVitalAttribution(String target, String resourceUrl, String interactionType,
                                      Double timeToFirstByte, Double resourceLoadDelay,
                                      Double resourceLoadDuration, Double elementRenderDelay,
                                      Double largestShiftTime, Double largestShiftValue, Double inputDelay,
                                      Double processingDuration, Double presentationDelay) {
    }

    public record NavigationTimingPayload(String kind, String navigationType, Integer redirectCount,
                                          Double dns, Double tcp, Double tls, Double request, Double response,
                                          Double domInteractive, Double domContentLoaded, Double load,
                                          Long transferSize, Long encodedBodySize, Long decodedBodySize) {
    }

    public record ResourcePayload(String url, String initiatorType, Double startTime, Double duration,
                                  Long transferSize, Long encodedBodySize, Long decodedBodySize,
                                  Boolean sizeAvailable, String nextHopProtocol, String renderBlockingStatus) {
    }
}
