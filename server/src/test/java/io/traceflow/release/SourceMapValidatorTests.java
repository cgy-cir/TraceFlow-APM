package io.traceflow.release;

import com.google.debugging.sourcemap.SourceMapConsumerV3;
import io.traceflow.event.EventApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;

class SourceMapValidatorTests {
    private final SourceMapValidator validator = new SourceMapValidator();
    private static final String MAP = """
            {"version":3,"file":"a.js","sources":["src/a.ts"],"names":[],"mappings":"AAAA","sourcesContent":["throw new Error('fixture')"]}
            """;
    static MockMultipartFile js() { return new MockMultipartFile("javascript", "a.js", "text/javascript", "throw new Error('fixture')".getBytes(StandardCharsets.UTF_8)); }
    static MockMultipartFile map(String json) { return new MockMultipartFile("sourceMap", "a.js.map", "application/json", json.getBytes(StandardCharsets.UTF_8)); }

    @Test void validMapsHaveByteChecksumsAndKnownOriginalCoordinates() throws Exception {
        var prepared = validator.prepare("/base/a.js", js(), map(MAP));
        assertThat(prepared.sourceCount()).isEqualTo(1);
        assertThat(prepared.sourcesWithContent()).isEqualTo(1);
        assertThat(prepared.jsHash()).isEqualTo(SourceMapValidator.sha256(js().getBytes()));
        var consumer = new SourceMapConsumerV3();
        consumer.parse(MAP);
        var original = consumer.getMappingForLine(1, 1);
        assertThat(original.getOriginalFile()).isEqualTo("src/a.ts");
        assertThat(original.getLineNumber()).isEqualTo(1);
        assertThat(original.getColumnPosition()).isEqualTo(1);
        try (var stream = SourceMapConsumerV3.class.getResourceAsStream("SourceMapConsumerV3.class")) {
            byte[] header = stream.readNBytes(8);
            assertThat((header[6] & 255) * 256 + (header[7] & 255)).isLessThanOrEqualTo(61);
        }
    }

    @Test void missingFileAndSourceContentAreSupported() {
        assertThatCode(() -> validator.prepare("/a.js", js(), map(MAP.replace("\"file\":\"a.js\",", "").replace("\"throw new Error('fixture')\"", "null")))).doesNotThrowAnyException();
        assertThat(validator.prepare("/a.js", js(), map(MAP.replace("\"throw new Error('fixture')\"", "null"))).sourcesWithContent()).isZero();
    }

    @Test void malformedIndexedAndMismatchedMapsAreRejected() {
        for (String json : new String[]{"{}", "[]", "{", MAP.replace("\"a.js\"", "\"wrong.js\""), MAP.replace("AAAA", "AAAAAA"),
                MAP.replace("AAAA", "AACA" ).replace("\"version\":3", "\"version\":2"), MAP.replace("\"names\":[]", "\"names\":[null]"),
                MAP.replace("\"mappings\":\"AAAA\"", "\"mappings\":\"AAAA\",\"sections\":[]"), MAP.replace("\"sourcesContent\":[\"throw new Error('fixture')\"]", "\"sourcesContent\":[]")}) {
            assertThatThrownBy(() -> validator.prepare("/a.js", js(), map(json))).isInstanceOf(EventApiException.class);
        }
    }

    @Test void emptyOversizedInvalidUtf8AndExcessiveLinesAreRejected() {
        assertThatThrownBy(() -> validator.prepare("/a.js", new MockMultipartFile("javascript", new byte[0]), map(MAP))).isInstanceOf(EventApiException.class);
        assertThatThrownBy(() -> validator.prepare("/a.js", new MockMultipartFile("javascript", new byte[SourceMapValidator.MAX_FILE_BYTES + 1]), map(MAP)))
                .isInstanceOf(EventApiException.class).satisfies(error -> assertThat(((EventApiException) error).getStatus()).isEqualTo(413));
        assertThatThrownBy(() -> validator.prepare("/a.js", js(), new MockMultipartFile("sourceMap", new byte[]{(byte) 0xff}))).isInstanceOf(EventApiException.class);
        assertThatThrownBy(() -> validator.prepare("/a.js", js(), map(MAP.replace("AAAA", ";".repeat(200001))))).isInstanceOf(EventApiException.class);
    }
}
