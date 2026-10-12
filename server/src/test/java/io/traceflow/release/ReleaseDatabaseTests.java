package io.traceflow.release;

import io.traceflow.event.EventApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = "traceflow.performance.aggregation-enabled=false")
@ActiveProfiles("test")
@Transactional
@EnabledIfEnvironmentVariable(named = "TRACEFLOW_RUN_DB_TESTS", matches = "true")
class ReleaseDatabaseTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired ReleaseService service;
    @Autowired SourceMapService maps;
    private long owner;
    private long app;
    private static final String HASH = "a".repeat(64);
    private static final String VALID_MAP = "{\"version\":3,\"file\":\"a.js\",\"sources\":[\"src/a.ts\"],\"names\":[],\"mappings\":\"AAAA\",\"sourcesContent\":[\"fixture\"]}";

    private ReleaseApi.CreateReleaseRequest uploadRequest(String name, String js, String map) {
        return new ReleaseApi.CreateReleaseRequest(app, name, null, List.of(new ReleaseApi.ArtifactInput("/a.js",
                SourceMapValidator.sha256(js.getBytes(java.nio.charset.StandardCharsets.UTF_8)), SourceMapValidator.sha256(map.getBytes(java.nio.charset.StandardCharsets.UTF_8)))));
    }
    private SourceMapService.UploadResult upload(long id) {
        return maps.upload(app, id, owner, "/a.js", SourceMapValidatorTests.js(), SourceMapValidatorTests.map(VALID_MAP));
    }

    @BeforeEach void setup() {
        jdbc.update("INSERT INTO users (email, password_hash, display_name, role, status, created_at, updated_at) VALUES (?, 'test', 'M4 Test', 'admin', 'active', 1, 1)", UUID.randomUUID() + "@test.local");
        owner = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        app = createApplication();
    }

    private long createApplication() {
        jdbc.update("INSERT INTO applications (name, app_key, allowed_origins, created_by, created_at, updated_at) VALUES ('M4 DB Test', ?, '[]', ?, 1, 1)", UUID.randomUUID().toString(), owner);
        return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private ReleaseApi.CreateReleaseRequest request(long application, String name) {
        return new ReleaseApi.CreateReleaseRequest(application, name, null,
                List.of(new ReleaseApi.ArtifactInput("/a.js", HASH, HASH)));
    }

    @Test void creationIsIdempotentCaseSensitiveAndScopedToApplication() {
        var first = service.create(request(app, "Demo@1"), owner);
        assertThat(first.created()).isTrue();
        assertThat(first.detail().release().createdAt()).isBetween(System.currentTimeMillis() - 10000, System.currentTimeMillis());
        var repeated = service.create(request(app, "Demo@1"), owner);
        assertThat(repeated.created()).isFalse();
        assertThat(repeated.detail()).isEqualTo(first.detail());
        assertThat(service.create(request(app, "demo@1"), owner).detail().release().id()).isNotEqualTo(first.detail().release().id());
        long otherApp = createApplication();
        assertThat(service.create(request(otherApp, "Demo@1"), owner).created()).isTrue();
        assertThatThrownBy(() -> service.get(otherApp, first.detail().release().id())).isInstanceOf(EventApiException.class);
        assertThat(service.list(app, "Demo", "draft", 1, 20).total()).isEqualTo(1);
    }

    @Test void changedManifestConflictsAndDatabaseEnforcesUniqueNames() {
        service.create(request(app, "demo@1"), owner);
        var changed = new ReleaseApi.CreateReleaseRequest(app, "demo@1", null, List.of(new ReleaseApi.ArtifactInput("/b.js", HASH, HASH)));
        assertThatThrownBy(() -> service.create(changed, owner)).isInstanceOf(EventApiException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO releases (application_id, release_name, manifest, created_by, created_at) SELECT application_id, release_name, manifest, created_by, created_at FROM releases WHERE application_id = ?", app))
                .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
        assertThat(service.list(app, null, null, 1, 20).total()).isEqualTo(1);
    }

    @Test void paginationIsStableAndMissingApplicationsFail() {
        service.create(request(app, "one"), owner);
        var second = service.create(request(app, "two"), owner);
        jdbc.update("UPDATE releases SET created_at = 100 WHERE application_id = ?", app);
        assertThat(service.list(app, null, null, 1, 1).items().get(0).id()).isEqualTo(second.detail().release().id());
        assertThat(service.list(app, null, null, 2, 1).items()).hasSize(1);
        assertThatThrownBy(() -> service.list(Long.MAX_VALUE, null, null, 1, 20)).isInstanceOf(EventApiException.class);
    }

    @Test void migrationConstraintsProtectMapIntegrityAndForeignKeys() {
        var release = service.create(request(app, "maps"), owner).detail().release();
        assertThatThrownBy(() -> jdbc.update("UPDATE releases SET status = 'invalid' WHERE id = ?", release.id()))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .satisfies(error -> assertThat(((java.sql.SQLException) error.getCause()).getErrorCode()).isEqualTo(3819));
        assertThatThrownBy(() -> jdbc.update("UPDATE releases SET created_at = -1 WHERE id = ?", release.id()))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .satisfies(error -> assertThat(((java.sql.SQLException) error.getCause()).getErrorCode()).isEqualTo(3819));
        String insert = "INSERT INTO source_maps (release_id, artifact_path, artifact_path_hash, js_sha256, map_sha256, js_bytes, map_bytes, map_content, source_count, sources_with_content, uploaded_by, uploaded_at) VALUES (?, '/a.js', ?, ?, ?, 1, ?, ?, 1, 1, ?, 1)";
        assertThatThrownBy(() -> jdbc.update(insert, release.id(), HASH, HASH, HASH, 2, new byte[]{1}, owner))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .satisfies(error -> assertThat(((java.sql.SQLException) error.getCause()).getErrorCode()).isEqualTo(3819));
        jdbc.update(insert, release.id(), HASH, HASH, HASH, 1, new byte[]{1}, owner);
        assertThatThrownBy(() -> jdbc.update(insert, release.id(), HASH, HASH, HASH, 1, new byte[]{1}, owner))
                .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
        assertThatThrownBy(() -> jdbc.update(insert, Long.MAX_VALUE, "b".repeat(64), HASH, HASH, 1, new byte[]{1}, owner))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void uploadDeletionFinalizationAndIdempotenceKeepCountersCorrect() {
        String js = "throw new Error('fixture')";
        long id = service.create(uploadRequest("upload", js, VALID_MAP), owner).detail().release().id();
        assertThatThrownBy(() -> maps.finalizeRelease(app, id)).isInstanceOf(EventApiException.class);
        var first = upload(id);
        assertThat(first.created()).isTrue();
        assertThat(upload(id).created()).isFalse();
        assertThat(service.get(app, id).release().artifactCount()).isEqualTo(1);
        assertThat(service.get(app, id).release().totalMapBytes()).isEqualTo(VALID_MAP.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        maps.delete(app, id, first.map().id());
        assertThat(service.get(app, id).release().artifactCount()).isZero();
        assertThat(service.get(app, id).release().totalMapBytes()).isZero();
        var reuploaded = upload(id);
        var finalized = maps.finalizeRelease(app, id);
        assertThat(finalized.release().status()).isEqualTo("finalized");
        assertThat(finalized.release().finalizedAt()).isGreaterThan(1_000_000_000_000L);
        assertThat(maps.finalizeRelease(app, id)).isEqualTo(finalized);
        assertThat(upload(id).created()).isFalse();
        assertThatThrownBy(() -> maps.delete(app, id, reuploaded.map().id())).isInstanceOf(EventApiException.class);
        assertThatThrownBy(() -> maps.list(createApplication(), id)).isInstanceOf(EventApiException.class);
    }

    @Test void deploymentIsFinalizedOnlyImmutableAndScopedWithMillisecondValidation() {
        long id = service.create(uploadRequest("deployment", "throw new Error('fixture')", VALID_MAP), owner).detail().release().id();
        assertThatThrownBy(() -> service.registerDeployment(app, id, System.currentTimeMillis()))
                .isInstanceOf(EventApiException.class)
                .satisfies(error -> assertThat(((EventApiException) error).getCode()).isEqualTo("RELEASE_NOT_FINALIZED"));
        upload(id);
        var finalized = maps.finalizeRelease(app, id);
        assertThat(finalized.release().deployedAt()).isNull();
        for (long invalid : new long[]{0, -1, System.currentTimeMillis() / 1000, finalized.release().finalizedAt() - 1, System.currentTimeMillis() + 120_000, Long.MAX_VALUE})
            assertThatThrownBy(() -> service.registerDeployment(app, id, invalid)).isInstanceOf(EventApiException.class)
                    .satisfies(error -> assertThat(((EventApiException) error).getCode()).isEqualTo("INVALID_DEPLOYMENT_TIME"));
        long deployedAt = System.currentTimeMillis();
        assertThatThrownBy(() -> service.registerDeployment(createApplication(), id, deployedAt)).isInstanceOf(EventApiException.class)
                .satisfies(error -> assertThat(((EventApiException) error).getCode()).isEqualTo("RELEASE_NOT_FOUND"));
        var registered = service.registerDeployment(app, id, deployedAt);
        assertThat(registered.release().deployedAt()).isEqualTo(deployedAt);
        assertThat(registered.artifacts()).isEqualTo(finalized.artifacts());
        assertThat(registered.release().finalizedAt()).isEqualTo(finalized.release().finalizedAt());
        assertThat(service.registerDeployment(app, id, deployedAt)).isEqualTo(registered);
        assertThatThrownBy(() -> service.registerDeployment(app, id, deployedAt + 1)).isInstanceOf(EventApiException.class)
                .satisfies(error -> assertThat(((EventApiException) error).getCode()).isEqualTo("DEPLOYMENT_CONFLICT"));
        assertThat(service.list(app, null, null, 1, 20).items().get(0).deployedAt()).isEqualTo(deployedAt);
    }

    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void concurrentDeploymentRegistersOneTimestampWithoutOverwrite() throws Exception {
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            long id = service.create(uploadRequest("deployment-race", "throw new Error('fixture')", VALID_MAP), owner).detail().release().id();
            upload(id);
            maps.finalizeRelease(app, id);
            long timestamp = System.currentTimeMillis();
            var gate = new java.util.concurrent.CountDownLatch(1);
            var first = executor.submit(() -> { gate.await(); return registerOutcome(id, timestamp); });
            var second = executor.submit(() -> { gate.await(); return registerOutcome(id, timestamp + 1); });
            gate.countDown();
            assertThat(List.of(first.get(15, java.util.concurrent.TimeUnit.SECONDS), second.get(15, java.util.concurrent.TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("ok", "DEPLOYMENT_CONFLICT");
            long stored = service.get(app, id).release().deployedAt();
            assertThat(stored).isIn(timestamp, timestamp + 1);
            assertThat(service.registerDeployment(app, id, stored).release().deployedAt()).isEqualTo(stored);
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(15, java.util.concurrent.TimeUnit.SECONDS);
            jdbc.update("DELETE FROM applications WHERE id = ? AND created_by = ?", app, owner);
            jdbc.update("DELETE FROM users WHERE id = ?", owner);
        }
    }

    private String registerOutcome(long id, long timestamp) {
        try { service.registerDeployment(app, id, timestamp); return "ok"; }
        catch (EventApiException error) { return error.getCode(); }
    }

    @Test void checksumAndPathConflictsNeverStoreOrCountFiles() {
        long id = service.create(uploadRequest("mismatch", "different JS", VALID_MAP), owner).detail().release().id();
        assertThatThrownBy(() -> upload(id)).isInstanceOf(EventApiException.class);
        assertThat(maps.list(app, id)).isEmpty();
        assertThat(service.get(app, id).release().artifactCount()).isZero();
        assertThatThrownBy(() -> maps.upload(app, id, owner, "/other/a.js", SourceMapValidatorTests.js(), SourceMapValidatorTests.map(VALID_MAP)))
                .isInstanceOf(EventApiException.class);
    }

    @Test void quotaIsCheckedBeforeWriting() {
        long id = service.create(uploadRequest("quota", "throw new Error('fixture')", VALID_MAP), owner).detail().release().id();
        jdbc.update("UPDATE releases SET total_map_bytes = ? WHERE id = ?", 100L * 1024 * 1024, id);
        assertThatThrownBy(() -> upload(id)).isInstanceOf(EventApiException.class)
                .satisfies(error -> assertThat(((EventApiException) error).getCode()).isEqualTo("RELEASE_QUOTA_EXCEEDED"));
        assertThat(maps.list(app, id)).isEmpty();
    }

    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void concurrentUploadsShareOneArtifactAndOneCounterIncrement() throws Exception {
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            long id = service.create(uploadRequest("concurrent", "throw new Error('fixture')", VALID_MAP), owner).detail().release().id();
            var gate = new java.util.concurrent.CountDownLatch(1);
            var first = executor.submit(() -> { gate.await(); return upload(id); });
            var second = executor.submit(() -> { gate.await(); return upload(id); });
            gate.countDown();
            var results = List.of(first.get(15, java.util.concurrent.TimeUnit.SECONDS), second.get(15, java.util.concurrent.TimeUnit.SECONDS));
            assertThat(results.stream().filter(SourceMapService.UploadResult::created).count()).isEqualTo(1);
            assertThat(results.get(0).map().id()).isEqualTo(results.get(1).map().id());
            assertThat(service.get(app, id).release().artifactCount()).isEqualTo(1);
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(15, java.util.concurrent.TimeUnit.SECONDS);
            jdbc.update("DELETE FROM applications WHERE id = ? AND created_by = ?", app, owner);
            jdbc.update("DELETE FROM users WHERE id = ?", owner);
        }
    }
}
