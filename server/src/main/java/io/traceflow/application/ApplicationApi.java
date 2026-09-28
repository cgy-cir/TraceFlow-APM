package io.traceflow.application;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/applications")
public class ApplicationApi {
    private final ApplicationService applicationService;

    public ApplicationApi(ApplicationService applicationService) {
        this.applicationService = applicationService;
    }

    @GetMapping
    public ApplicationListResponse list() {
        List<ApplicationResponse> items = applicationService.list();
        return new ApplicationListResponse(items, items.size());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApplicationResponse create(@Valid @RequestBody CreateApplicationRequest request) {
        return applicationService.create(request);
    }

    public record CreateApplicationRequest(
            @NotBlank @Size(max = 100) String name,
            @NotEmpty @Size(max = 20) List<@NotBlank @Size(max = 2048) String> allowedOrigins,
            @Min(1) @Max(3650) Integer retentionDays) {
    }

    public record ApplicationResponse(
            Long id,
            String name,
            String appKey,
            String platform,
            List<String> allowedOrigins,
            Integer retentionDays,
            String status,
            Long createdAt) {
    }

    public record ApplicationListResponse(List<ApplicationResponse> items, long total) {
    }
}
