package io.traceflow.performance;

import io.traceflow.performance.PerformanceQueryService.OverviewResponse;
import io.traceflow.performance.PerformanceQueryService.PagesResponse;
import io.traceflow.performance.PerformanceQueryService.QueryFilter;
import io.traceflow.performance.PerformanceQueryService.ResourcesResponse;
import io.traceflow.performance.PerformanceQueryService.SummaryResponse;
import io.traceflow.performance.PerformanceQueryService.TrendsResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class PerformanceQueryApi {
    private final PerformanceQueryService service;

    public PerformanceQueryApi(PerformanceQueryService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/performance/summary")
    public SummaryResponse summary(@RequestParam long applicationId,
                                   @RequestParam long from,
                                   @RequestParam long to,
                                   @RequestParam(required = false) String environment,
                                   @RequestParam(required = false) String release,
                                   @RequestParam(required = false) String pagePath,
                                   @RequestParam(required = false) String deviceType,
                                   @RequestParam(required = false) List<String> metrics) {
        return service.summary(filter(applicationId, from, to, environment, release, pagePath, deviceType), metrics);
    }

    @GetMapping("/api/v1/performance/trends")
    public TrendsResponse trends(@RequestParam long applicationId,
                                 @RequestParam long from,
                                 @RequestParam long to,
                                 @RequestParam(required = false) String environment,
                                 @RequestParam(required = false) String release,
                                 @RequestParam(required = false) String pagePath,
                                 @RequestParam(required = false) String deviceType,
                                 @RequestParam(required = false) List<String> metrics,
                                 @RequestParam(defaultValue = "hour") String interval) {
        return service.trends(filter(applicationId, from, to, environment, release, pagePath, deviceType),
                metrics, interval);
    }

    @GetMapping("/api/v1/performance/pages")
    public PagesResponse pages(@RequestParam long applicationId,
                               @RequestParam long from,
                               @RequestParam long to,
                               @RequestParam(required = false) String environment,
                               @RequestParam(required = false) String release,
                               @RequestParam(required = false) String pagePath,
                               @RequestParam(required = false) String deviceType,
                               @RequestParam(defaultValue = "20") int limit) {
        return service.pages(filter(applicationId, from, to, environment, release, pagePath, deviceType), limit);
    }

    @GetMapping("/api/v1/resources")
    public ResourcesResponse resources(@RequestParam long applicationId,
                                       @RequestParam(required = false) Long from,
                                       @RequestParam(required = false) Long to,
                                       @RequestParam(required = false) String environment,
                                       @RequestParam(required = false) String release,
                                       @RequestParam(required = false) String pagePath,
                                       @RequestParam(required = false) String deviceType,
                                       @RequestParam(defaultValue = "100") int limit) {
        return service.resources(applicationId, from, to, environment, release, pagePath, deviceType, limit);
    }

    @GetMapping("/api/v1/overview")
    public OverviewResponse overview(@RequestParam long applicationId,
                                     @RequestParam long from,
                                     @RequestParam long to,
                                     @RequestParam(required = false) String environment,
                                     @RequestParam(required = false) String release,
                                     @RequestParam(required = false) String pagePath,
                                     @RequestParam(required = false) String deviceType) {
        return service.overview(filter(applicationId, from, to, environment, release, pagePath, deviceType));
    }

    private QueryFilter filter(long applicationId, long from, long to, String environment, String release,
                               String pagePath, String deviceType) {
        return new QueryFilter(applicationId, from, to, environment, release, pagePath, deviceType);
    }
}
