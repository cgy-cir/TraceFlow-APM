package io.traceflow.release;

import io.traceflow.event.EventApiException;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class ReleaseValidationTests {
    private static final String HASH = "a".repeat(64);
    private static ReleaseApi.ArtifactInput artifact(String path) { return new ReleaseApi.ArtifactInput(path, HASH, HASH); }
    private static ReleaseApi.CreateReleaseRequest request(String name, List<ReleaseApi.ArtifactInput> artifacts) {
        return new ReleaseApi.CreateReleaseRequest(1, name, null, artifacts);
    }

    @Test void pathsPreserveBaseAndCaseAndNormalizeEncoding() {
        assertThat(ArtifactPath.normalize("/base/assets/%69ndex-Ab.js")).isEqualTo("/base/assets/index-Ab.js");
        assertThat(ArtifactPath.normalize("/源码.js")).isEqualTo("/%E6%BA%90%E7%A0%81.js");
        assertThat(ArtifactPath.normalize("/%e6%ba%90%e7%a0%81.js")).isEqualTo("/%E6%BA%90%E7%A0%81.js");
        assertThat(ArtifactPath.normalize("/😀.js")).isEqualTo("/%F0%9F%98%80.js");
    }

    @Test void pathsRejectTraversalUrlsQueriesAndAmbiguousEncoding() {
        for (String path : List.of("index.js", "https://example.com/index.js", "/../index.js", "/%2e%2e/index.js",
                "/a%2fb.js", "/a%5cb.js", "/%252e/index.js", "/a\\b.js", "/a.js?v=1", "/a.js#x",
                "/a%.js", "/%ff.js", "/%C2%85.js", "/%ＦＦ.js", "/a\n.js", "/a.css", "/a[0].js")) {
            assertThatThrownBy(() -> ArtifactPath.normalize(path)).as(path).isInstanceOf(EventApiException.class);
        }
    }

    @Test void manifestsAreSortedWithoutCollapsingDifferentDirectoriesOrCase() {
        var manifest = ReleaseService.canonicalManifest(request("Demo@1", List.of(artifact("/b/index.js"), artifact("/a/index.js"), artifact("/a/Index.js"))));
        assertThat(manifest).extracting(ReleaseApi.ArtifactInput::artifactPath)
                .containsExactly("/a/Index.js", "/a/index.js", "/b/index.js");
    }

    @Test void duplicateCanonicalPathsAreRejected() {
        assertThatThrownBy(() -> ReleaseService.canonicalManifest(request("demo@1", List.of(artifact("/index.js"), artifact("/%69ndex.js")))))
                .isInstanceOf(EventApiException.class);
    }

    @Test void namesAndHashesHaveStrictContracts() {
        for (String name : List.of("", " ", " demo", "demo ", "demo\t1", "demo\n1", "demo\u00a0", "x".repeat(101))) {
            assertThatThrownBy(() -> ReleaseService.canonicalManifest(request(name, List.of(artifact("/a.js")))))
                    .isInstanceOf(EventApiException.class);
        }
        assertThatThrownBy(() -> ReleaseService.canonicalManifest(request("demo", List.of(new ReleaseApi.ArtifactInput("/a.js", "short", HASH)))))
                .isInstanceOf(EventApiException.class);
        assertThatThrownBy(() -> ReleaseService.canonicalManifest(request("demo", List.of()))).isInstanceOf(EventApiException.class);
        assertThatThrownBy(() -> ReleaseService.canonicalManifest(new ReleaseApi.CreateReleaseRequest(1, "demo", "short", List.of(artifact("/a.js")))))
                .isInstanceOf(EventApiException.class);
    }
}
