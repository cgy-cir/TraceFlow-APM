package io.traceflow.event;

import java.util.List;
import java.util.Map;

public record EventBatchRequest(
        Integer schemaVersion,
        String batchId,
        String appKey,
        Long sentAt,
        SdkContext sdk,
        List<TraceEventRequest> events) {

    public record SdkContext(String name, String version) {
    }

    public record TraceEventRequest(
            String eventId,
            String type,
            Long timestamp,
            String sessionId,
            String anonymousId,
            String environment,
            String release,
            String traceId,
            PageContext page,
            UserContext user,
            DeviceContext device,
            Map<String, String> tags,
            List<Map<String, Object>> breadcrumbs,
            Map<String, Object> payload) {
    }

    public record PageContext(String url, String path, String title, String referrer) {
    }

    public record UserContext(String id) {
    }

    public record DeviceContext(
            String userAgent,
            String language,
            Integer screenWidth,
            Integer screenHeight,
            Integer viewportWidth,
            Integer viewportHeight) {
    }
}
