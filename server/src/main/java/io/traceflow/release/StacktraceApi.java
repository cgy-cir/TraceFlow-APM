package io.traceflow.release;

import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
public class StacktraceApi {
    private final StacktraceService service;
    public StacktraceApi(StacktraceService service) { this.service = service; }
    @GetMapping("/api/v1/events/{eventId}/stacktrace")
    public ResponseEntity<StacktraceResponse> get(@PathVariable @Positive long eventId, @RequestParam @Positive long applicationId) {
        return ResponseEntity.ok().header("Cache-Control", "private, no-store").body(service.get(applicationId, eventId));
    }
}
