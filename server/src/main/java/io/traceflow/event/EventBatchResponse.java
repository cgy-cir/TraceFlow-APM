package io.traceflow.event;

import java.util.List;

public record EventBatchResponse(String requestId, int accepted, int rejected, List<EventRejection> errors) {
    public record EventRejection(int index, String eventId, String code, String message) {
    }
}
