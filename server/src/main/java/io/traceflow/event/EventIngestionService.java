package io.traceflow.event;

import io.traceflow.application.ApplicationEntity;
import io.traceflow.application.ApplicationService;
import io.traceflow.event.EventBatchRequest.TraceEventRequest;
import io.traceflow.event.EventBatchResponse.EventRejection;
import io.traceflow.event.EventValidationService.ValidationResult;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class EventIngestionService {
    private final ApplicationService applicationService;
    private final EventValidationService validationService;
    private final EventWriter eventWriter;
    private final ObjectMapper objectMapper;

    public EventIngestionService(ApplicationService applicationService, EventValidationService validationService,
                                 EventWriter eventWriter, ObjectMapper objectMapper) {
        this.applicationService = applicationService;
        this.validationService = validationService;
        this.eventWriter = eventWriter;
        this.objectMapper = objectMapper;
    }

    public EventBatchResponse ingest(EventBatchRequest batch, String origin) {
        validateBatch(batch);
        ApplicationEntity application = applicationService.findActiveByAppKey(batch.appKey());
        if (application == null) throw new EventApiException(404, "APPLICATION_NOT_FOUND", "appKey does not exist");
        validateOrigin(application, origin);

        List<EventRejection> errors = new ArrayList<>();
        int accepted = 0;
        for (int index = 0; index < batch.events().size(); index++) {
            TraceEventRequest event = batch.events().get(index);
            ValidationResult validation = validationService.validate(event);
            if (!validation.valid()) {
                errors.add(new EventRejection(index, validation.eventId(), validation.code(), validation.message()));
                continue;
            }
            if (!eventWriter.store(application.getId(), batch, event, validation.typedPayload())) {
                errors.add(new EventRejection(index, event.eventId(), "DUPLICATE_EVENT", "event was already accepted"));
                continue;
            }
            accepted++;
        }
        return new EventBatchResponse(UUID.randomUUID().toString(), accepted, errors.size(), errors);
    }

    private void validateBatch(EventBatchRequest batch) {
        if (batch == null || batch.schemaVersion() == null || batch.schemaVersion() != 1) {
            throw new EventApiException(400, "UNSUPPORTED_SCHEMA", "schemaVersion must be 1");
        }
        if (!isUuid(batch.batchId()) || batch.appKey() == null || batch.appKey().isBlank()
                || batch.sdk() == null || !"@traceflow/web-sdk".equals(batch.sdk().name())
                || batch.events() == null || batch.events().isEmpty() || batch.events().size() > 50) {
            throw new EventApiException(400, "INVALID_BATCH", "batch fields are invalid or events is not between 1 and 50");
        }
    }

    private void validateOrigin(ApplicationEntity application, String origin) {
        if (origin == null || origin.isBlank()) return;
        JsonNode origins = objectMapper.readTree(application.getAllowedOrigins());
        boolean allowed = origins != null && origins.isArray()
                && origins.valueStream().map(JsonNode::asText).anyMatch(origin::equals);
        if (!allowed) throw new EventApiException(403, "ORIGIN_NOT_ALLOWED", "request Origin is not allowed for this application");
    }

    private boolean isUuid(String value) {
        try { UUID.fromString(value); return true; } catch (Exception ignored) { return false; }
    }

}
