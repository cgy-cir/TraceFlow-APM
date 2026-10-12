package io.traceflow.release;

import io.traceflow.event.EventEntity;
import io.traceflow.event.EventMapper;
import io.traceflow.event.EventApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class StacktraceServiceTests {
    private final EventMapper events = mock(EventMapper.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ReleaseService releases = mock(ReleaseService.class);
    private final SourceMapValidator validator = spy(new SourceMapValidator());
    private final ObjectMapper mapper = new ObjectMapper();
    private StacktraceService service;
    private EventEntity event;
    private String json = "{\"version\":3,\"file\":\"a.js\",\"sources\":[\"src/a.ts\"],\"names\":[],\"mappings\":\"AAEA\",\"sourcesContent\":[\"first\\nsecond\\n<script>literal source</script>\\nfourth\"]}";
    private byte[] stored;
    private String state = "finalized";
    private boolean registered = true;

    @BeforeEach @SuppressWarnings("unchecked") void setup() throws Exception {
        stored = json.getBytes(StandardCharsets.UTF_8);
        event = new EventEntity(); event.setId(7L); event.setApplicationId(1L); event.setType("error"); event.setReleaseName("v1");
        event.setPayload(mapper.writeValueAsString(mapper.createObjectNode().put("stack", "Error\n at pay (https://example.com/base/a.js:1:1)")));
        when(events.findById(1, 7)).thenReturn(event);
        when(releases.get(1, 9)).thenAnswer(invocation -> new ReleaseService.ReleaseDetail(
                new ReleaseService.ReleaseSummary(9, 1, "v1", null, state, 1, 1, stored.length, 1, 1, 2L, null),
                List.of(new ReleaseApi.ArtifactInput("/base/a.js", "a".repeat(64), SourceMapValidator.sha256(json.getBytes(StandardCharsets.UTF_8))))));
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.startsWith("SELECT id FROM releases")) return registered ? List.of(9L) : List.of();
            var rs = mock(ResultSet.class);
            when(rs.getString("artifact_path")).thenReturn("/base/a.js");
            when(rs.getString("js_sha256")).thenReturn("a".repeat(64));
            when(rs.getString("map_sha256")).thenReturn(SourceMapValidator.sha256(json.getBytes(StandardCharsets.UTF_8)));
            when(rs.getLong("js_bytes")).thenReturn(1000L);
            when(rs.getLong("map_bytes")).thenReturn((long) stored.length);
            when(rs.getBytes("map_content")).thenReturn(stored);
            RowMapper<?> row = invocation.getArgument(1);
            return List.of(row.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
        service = new StacktraceService(events, jdbc, releases, validator, mapper);
    }

    @Test void mappingHasOneBasedCoordinatesLiteralSourceAndCachedResults() {
        String before = event.getPayload();
        var result = service.get(1, 7);
        assertThat(result.status()).isEqualTo("resolved");
        var source = result.frames().get(0).original();
        assertThat(source.filename()).isEqualTo("src/a.ts");
        assertThat(source.line()).isEqualTo(3); assertThat(source.column()).isEqualTo(1);
        assertThat(source.context().stream().filter(StacktraceResponse.ContextLine::isErrorLine).findFirst().orElseThrow().content()).isEqualTo("<script>literal source</script>");
        assertThat(service.get(1, 7)).isEqualTo(result);
        verify(validator, times(1)).parseStored(anyString(), any());
        assertThat(event.getPayload()).isEqualTo(before);
        assertThatThrownBy(() -> service.get(2, 7)).isInstanceOf(EventApiException.class);
    }

    @Test void missingReleaseAndUnregisteredOrDraftVersionsAreNotNegativeCached() {
        event.setReleaseName(null);
        assertThat(service.get(1, 7).diagnostics()).extracting(StacktraceResponse.Diagnostic::code).contains("MISSING_RELEASE");
        event.setReleaseName("v1"); registered = false;
        assertThat(service.get(1, 7).diagnostics()).extracting(StacktraceResponse.Diagnostic::code).contains("RELEASE_NOT_FOUND");
        registered = true; state = "draft";
        assertThat(service.get(1, 7).diagnostics()).extracting(StacktraceResponse.Diagnostic::code).contains("RELEASE_NOT_FINALIZED");
        state = "finalized";
        assertThat(service.get(1, 7).status()).isEqualTo("resolved");
    }

    @Test void partialFramesAndMissingSourceContentRemainUseful() {
        json = json.replace(",\"sourcesContent\":[\"first\\nsecond\\n<script>literal source</script>\\nfourth\"]", "");
        stored = json.getBytes(StandardCharsets.UTF_8);
        event.setPayload(mapper.writeValueAsString(mapper.createObjectNode().put("stack", "Error\n at pay (https://example.com/base/a.js:1:1)\n at other (https://cdn.example.com/other.js:1:1)")));
        var result = service.get(1, 7);
        assertThat(result.status()).isEqualTo("partial");
        assertThat(result.frames().get(0).original().context()).isEmpty();
        assertThat(result.diagnostics()).extracting(StacktraceResponse.Diagnostic::code).contains("SOURCE_CONTENT_MISSING", "SOURCE_MAP_NOT_FOUND");
    }

    @Test void corruptionDoesNotProduceWrongSourceOrPoisonCache() {
        stored = "corrupted".getBytes(StandardCharsets.UTF_8);
        assertThat(service.get(1, 7).diagnostics()).extracting(StacktraceResponse.Diagnostic::code).contains("SOURCE_MAP_UNAVAILABLE");
        stored = json.getBytes(StandardCharsets.UTF_8);
        assertThat(service.get(1, 7).status()).isEqualTo("resolved");
    }

    @Test void nonErrorEventsAndMissingPositionsDoNotPretendToResolve() {
        event.setType("http");
        assertThat(service.get(1, 7).status()).isEqualTo("not_applicable");
        event.setType("error"); event.setPayload("{}");
        assertThat(service.get(1, 7).status()).isEqualTo("unresolved");
    }

    @Test void concurrentIdenticalQueriesOnlyParseOnce() throws Exception {
        var started = new java.util.concurrent.CountDownLatch(1);
        var resume = new java.util.concurrent.CountDownLatch(1);
        doAnswer(invocation -> { started.countDown(); resume.await(); return invocation.callRealMethod(); }).when(validator).parseStored(anyString(), any());
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> service.get(1, 7));
            assertThat(started.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> service.get(1, 7));
            verify(events, timeout(1000).times(2)).findById(1, 7);
            resume.countDown();
            assertThat(second.get(5, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(first.get(5, java.util.concurrent.TimeUnit.SECONDS));
            verify(validator, times(1)).parseStored(anyString(), any());
        } finally { resume.countDown(); executor.shutdownNow(); executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS); }
    }

    @Test void unmappedSegmentsAndUtf16ColumnsAreNotOffByOne() {
        json = "{\"version\":3,\"file\":\"a.js\",\"sources\":[\"src/a.ts\"],\"names\":[],\"mappings\":\"AAAA,GAAE,K\",\"sourcesContent\":[\"😀x\"]}";
        stored = json.getBytes(StandardCharsets.UTF_8);
        event.setPayload(mapper.writeValueAsString(mapper.createObjectNode().put("stack", "Error\n at pay (https://example.com/base/a.js:1:4)\n at pay (https://example.com/base/a.js:1:9)")));
        var result = service.get(1, 7);
        assertThat(result.frames().get(0).original().line()).isEqualTo(1);
        assertThat(result.frames().get(0).original().column()).isEqualTo(3);
        assertThat(result.frames().get(1).reason()).isEqualTo("NO_MAPPING");
    }

    @Test void largeSourceContextsStayWithinResponseBudget() {
        var root = mapper.readTree(json).deepCopy();
        var content = mapper.createArrayNode().add(("源".repeat(2000) + "\n").repeat(8));
        ((tools.jackson.databind.node.ObjectNode) root).set("sourcesContent", content);
        json = mapper.writeValueAsString(root); stored = json.getBytes(StandardCharsets.UTF_8);
        event.setPayload(mapper.writeValueAsString(mapper.createObjectNode().put("stack", "Error\n" + " at pay (https://example.com/base/a.js:1:1)\n".repeat(50))));
        var result = service.get(1, 7);
        assertThat(mapper.writeValueAsBytes(result).length).isLessThanOrEqualTo(256 * 1024);
        assertThat(result.truncated()).isTrue();
        assertThat(result.diagnostics()).extracting(StacktraceResponse.Diagnostic::code).contains("RESPONSE_LIMIT_EXCEEDED");
    }

    @Test void emptyGeneratedLinesNeverBorrowPreviousLineMappings() {
        json = json.replace("AAEA", "AAAA;;AAAA");
        stored = json.getBytes(StandardCharsets.UTF_8);
        event.setPayload(mapper.writeValueAsString(mapper.createObjectNode().put("stack", "Error\n at pay (https://example.com/base/a.js:2:1)")));
        assertThat(service.get(1, 7).frames().get(0).reason()).isEqualTo("NO_MAPPING");
    }

    @Test void missingThirdPartyMapsDoNotConsumeTheParserMapBudget() {
        StringBuilder stack = new StringBuilder("Error\n");
        for (int i = 0; i < 11; i++) stack.append(" at third (https://third.example/").append(i).append(".js:1:1)\n");
        stack.append(" at pay (https://example.com/base/a.js:1:1)");
        event.setPayload(mapper.writeValueAsString(mapper.createObjectNode().put("stack", stack.toString())));
        var result = service.get(1, 7);
        assertThat(result.frames().get(11).original()).isNotNull();
        assertThat(result.diagnostics()).extracting(StacktraceResponse.Diagnostic::code).doesNotContain("MAP_LIMIT_EXCEEDED");
    }
}
