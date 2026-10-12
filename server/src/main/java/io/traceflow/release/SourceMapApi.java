package io.traceflow.release;

import io.traceflow.user.AccountPrincipal;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@RestController
@RequestMapping("/api/v1/releases/{releaseId}")
@Validated
public class SourceMapApi {
    private final SourceMapService service;
    public SourceMapApi(SourceMapService service) { this.service = service; }

    @GetMapping("/source-maps")
    public MapList list(@PathVariable @Positive long releaseId, @RequestParam @Positive long applicationId) {
        return new MapList(service.list(applicationId, releaseId));
    }
    @PostMapping(value = "/source-maps", consumes = "multipart/form-data")
    public ResponseEntity<SourceMapService.MapSummary> upload(@PathVariable @Positive long releaseId, @RequestParam @Positive long applicationId,
            @AuthenticationPrincipal AccountPrincipal principal, @RequestParam String artifactPath,
            @RequestPart MultipartFile javascript, @RequestPart MultipartFile sourceMap) {
        var result = service.upload(applicationId, releaseId, principal.id(), artifactPath, javascript, sourceMap);
        return ResponseEntity.status(result.created() ? 201 : 200).body(result.map());
    }
    @DeleteMapping("/source-maps/{mapId}")
    public ResponseEntity<Void> delete(@PathVariable @Positive long releaseId, @PathVariable @Positive long mapId, @RequestParam @Positive long applicationId) {
        service.delete(applicationId, releaseId, mapId);
        return ResponseEntity.noContent().build();
    }
    @PostMapping("/finalize")
    public ReleaseService.ReleaseDetail finalizeRelease(@PathVariable @Positive long releaseId, @RequestParam @Positive long applicationId) {
        return service.finalizeRelease(applicationId, releaseId);
    }
    public record MapList(List<SourceMapService.MapSummary> items) { }
}
