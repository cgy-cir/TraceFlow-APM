package io.traceflow.event;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/v1/events")
public class EventApi {
    private final ObjectMapper objectMapper;
    private final EventIngestionService ingestionService;

    public EventApi(ObjectMapper objectMapper, EventIngestionService ingestionService) {
        this.objectMapper = objectMapper;
        this.ingestionService = ingestionService;
    }

    @PostMapping(value = "/batch", consumes = { MediaType.APPLICATION_JSON_VALUE, MediaType.TEXT_PLAIN_VALUE })
    public EventBatchResponse ingest(@RequestBody String body, HttpServletRequest request) {
        if (body.getBytes(StandardCharsets.UTF_8).length > 512 * 1024) {
            throw new EventApiException(413, "BATCH_TOO_LARGE", "request body exceeds 512 KiB");
        }
        try {
            EventBatchRequest batch = objectMapper.readValue(body, EventBatchRequest.class);
            return ingestionService.ingest(batch, request.getHeader("Origin"));
        } catch (EventApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new EventApiException(400, "INVALID_JSON", "request body is not valid event JSON");
        }
    }
}
