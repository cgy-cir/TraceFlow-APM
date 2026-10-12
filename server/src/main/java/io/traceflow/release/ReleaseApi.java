package io.traceflow.release;

import io.traceflow.user.AccountPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/releases")
@Validated
public class ReleaseApi {
    private final ReleaseService service;
    public ReleaseApi(ReleaseService service) { this.service = service; }

    @GetMapping
    public ReleaseService.ReleaseList list(@RequestParam @Positive long applicationId,
            @RequestParam(required = false) @Size(max = 100) String query,
            @RequestParam(required = false) @Pattern(regexp = "draft|finalized") String status,
            @RequestParam(defaultValue = "1") @Min(1) @Max(10000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return service.list(applicationId, query, status, page, pageSize);
    }

    @GetMapping("/{id}")
    public ReleaseService.ReleaseDetail detail(@PathVariable @Positive long id, @RequestParam @Positive long applicationId) {
        return service.get(applicationId, id);
    }

    @PostMapping
    public ResponseEntity<ReleaseService.ReleaseDetail> create(@AuthenticationPrincipal AccountPrincipal principal,
            @Valid @RequestBody CreateReleaseRequest request) {
        var result = service.create(request, principal.id());
        return ResponseEntity.status(result.created() ? 201 : 200).body(result.detail());
    }

    @PatchMapping("/{id}/deployment")
    public ReleaseService.ReleaseDetail registerDeployment(@PathVariable @Positive long id,
            @RequestParam @Positive long applicationId, @Valid @RequestBody DeploymentRequest request) {
        return service.registerDeployment(applicationId, id, request.deployedAt());
    }

    public record DeploymentRequest(@NotNull @Positive Long deployedAt) { }

    public record CreateReleaseRequest(@Positive long applicationId,
            @NotBlank @Size(max = 100) String releaseName,
            @Pattern(regexp = "[a-fA-F0-9]{40}|[a-fA-F0-9]{64}") String commitSha,
            @NotEmpty @Size(max = 100) List<@NotNull @Valid ArtifactInput> artifacts) { }
    public record ArtifactInput(@NotBlank @Size(max = 1024) String artifactPath,
            @NotNull @Pattern(regexp = "[a-f0-9]{64}") String jsSha256,
            @NotNull @Pattern(regexp = "[a-f0-9]{64}") String mapSha256) { }
}
