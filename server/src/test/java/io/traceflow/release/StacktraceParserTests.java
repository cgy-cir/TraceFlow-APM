package io.traceflow.release;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

class StacktraceParserTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void chromiumFramesKeepPortsQueriesAndOriginalOrder() {
        var payload = mapper.createObjectNode().put("stack", "Error: fixture\n    at async pay (https://example.com:8443/base/assets/a.js?v=1#x:1:42)\n    at https://example.com:8443/base/assets/a.js:2:4\n    at eval (native)");
        var frames = StacktraceParser.parse(payload).frames();
        assertThat(frames).hasSize(3);
        assertThat(frames.get(0).artifactPath()).isEqualTo("/base/assets/a.js");
        assertThat(frames.get(0).generated().functionName()).isEqualTo("async pay");
        assertThat(frames.get(0).generated().column()).isEqualTo(42);
        assertThat(frames.get(1).generated().line()).isEqualTo(2);
        assertThat(frames.get(2).reason()).isNotNull();
    }

    @Test void fallbackSupportsPositivePositionsButDoesNotInventZeroColumns() {
        var payload = mapper.createObjectNode().put("filename", "http://localhost:5174/a.js").put("lineno", 1).put("colno", 1);
        assertThat(StacktraceParser.parse(payload).frames().get(0).artifactPath()).isEqualTo("/a.js");
        payload.put("colno", 0);
        assertThat(StacktraceParser.parse(payload).frames().get(0).reason()).isEqualTo("MISSING_POSITION");
    }

    @Test void unsupportedFramesAndTraversalNeverBecomeArtifactPaths() {
        for (String location : new String[]{"blob:http://localhost/a.js:1:2", "file:///a.js:1:2", "http://localhost/%2e%2e/a.js:1:2", "http://localhost/a%2Fb.js:1:2"}) {
            var frame = StacktraceParser.parse(mapper.createObjectNode().put("stack", "Error\n at fn (" + location + ")")).frames().get(0);
            assertThat(frame.artifactPath()).isNull();
            assertThat(frame.reason()).isEqualTo("UNSUPPORTED_FRAME");
        }
        assertThat(StacktraceParser.parse(mapper.createObjectNode().put("stack", "Error\n fn@http://localhost/a.js:1:2")).frames().get(0).reason()).isEqualTo("UNSUPPORTED_FRAME");
    }

    @Test void framesAndRawStringsAreBounded() {
        var stack = "Error\n" + " at fn (http://localhost/a.js:1:2)\n".repeat(51);
        var parsed = StacktraceParser.parse(mapper.createObjectNode().put("stack", stack));
        assertThat(parsed.frames()).hasSize(50);
        assertThat(parsed.truncated()).isTrue();
        assertThat(StacktraceParser.clip("a😀", 2)).isEqualTo("a");
    }
}
