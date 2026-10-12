package io.traceflow.release;

import io.traceflow.event.EventApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

@Service
public class SourceMapService {
    private static final String COLUMNS = "id, artifact_path, js_sha256, map_sha256, js_bytes, map_bytes, source_count, sources_with_content, uploaded_by, uploaded_at";
    private final JdbcTemplate jdbc;
    private final ReleaseService releases;
    private final SourceMapValidator validator;
    private final TransactionTemplate transaction;

    public SourceMapService(JdbcTemplate jdbc, ReleaseService releases, SourceMapValidator validator, PlatformTransactionManager manager) {
        this.jdbc = jdbc; this.releases = releases; this.validator = validator; this.transaction = new TransactionTemplate(manager);
    }

    public List<MapSummary> list(long applicationId, long releaseId) {
        releases.get(applicationId, releaseId);
        return findMaps(releaseId);
    }

    public UploadResult upload(long applicationId, long releaseId, long uploader, String path, MultipartFile js, MultipartFile map) {
        releases.get(applicationId, releaseId);
        var upload = validator.prepare(path, js, map);
        // Parsing occurs before entering the short transaction; the release lock serializes all mutations.
        return transaction.execute(status -> {
            lock(applicationId, releaseId);
            var detail = releases.get(applicationId, releaseId);
            var expected = detail.artifacts().stream().filter(item -> item.artifactPath().equals(upload.path())).findFirst()
                    .orElseThrow(() -> new EventApiException(409, "ARTIFACT_CONFLICT", "该资源路径不在版本清单中"));
            if (!expected.jsSha256().equals(upload.jsHash()) || !expected.mapSha256().equals(upload.mapHash()))
                throw new EventApiException(409, "ARTIFACT_CONFLICT", "文件摘要与版本清单不一致，请上传同一次构建的文件");
            var existing = jdbc.query("SELECT " + COLUMNS + " FROM source_maps WHERE release_id = ? AND artifact_path_hash = ?",
                    SourceMapService::mapSummary, releaseId, upload.pathHash());
            if (!existing.isEmpty()) {
                var previous = existing.get(0);
                if (!previous.artifactPath().equals(upload.path()) || !previous.jsSha256().equals(upload.jsHash()) || !previous.mapSha256().equals(upload.mapHash()))
                    throw new EventApiException(409, "ARTIFACT_CONFLICT", "资源路径或摘要冲突，不能覆盖已有产物");
                return new UploadResult(previous, false);
            }
            requireDraft(detail);
            if (detail.release().artifactCount() >= 100 || detail.release().totalMapBytes() + upload.mapContent().length > 100L * 1024 * 1024)
                throw new EventApiException(409, "RELEASE_QUOTA_EXCEEDED", "版本产物数量或 Map 总量超过上限");
            var keys = new GeneratedKeyHolder();
            long now = System.currentTimeMillis();
            jdbc.update(connection -> {
                var statement = connection.prepareStatement("""
                        INSERT INTO source_maps (release_id, artifact_path, artifact_path_hash, js_sha256, map_sha256,
                        js_bytes, map_bytes, map_content, source_count, sources_with_content, uploaded_by, uploaded_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, Statement.RETURN_GENERATED_KEYS);
                statement.setLong(1, releaseId); statement.setString(2, upload.path()); statement.setString(3, upload.pathHash());
                statement.setString(4, upload.jsHash()); statement.setString(5, upload.mapHash()); statement.setLong(6, upload.jsBytes());
                statement.setLong(7, upload.mapContent().length); statement.setBytes(8, upload.mapContent());
                statement.setInt(9, upload.sourceCount()); statement.setInt(10, upload.sourcesWithContent());
                statement.setLong(11, uploader); statement.setLong(12, now);
                return statement;
            }, keys);
            jdbc.update("UPDATE releases SET artifact_count = artifact_count + 1, total_map_bytes = total_map_bytes + ? WHERE id = ?",
                    upload.mapContent().length, releaseId);
            return new UploadResult(new MapSummary(keys.getKey().longValue(), upload.path(), upload.jsHash(), upload.mapHash(),
                    upload.jsBytes(), upload.mapContent().length, upload.sourceCount(), upload.sourcesWithContent(), uploader, now), true);
        });
    }

    public void delete(long applicationId, long releaseId, long mapId) {
        transaction.executeWithoutResult(status -> {
            lock(applicationId, releaseId);
            requireDraft(releases.get(applicationId, releaseId));
            var maps = jdbc.query("SELECT " + COLUMNS + " FROM source_maps WHERE id = ? AND release_id = ?",
                    SourceMapService::mapSummary, mapId, releaseId);
            if (maps.isEmpty()) throw new EventApiException(404, "SOURCE_MAP_NOT_FOUND", "该版本中没有找到产物");
            jdbc.update("DELETE FROM source_maps WHERE id = ? AND release_id = ?", mapId, releaseId);
            jdbc.update("UPDATE releases SET artifact_count = artifact_count - 1, total_map_bytes = total_map_bytes - ? WHERE id = ?",
                    maps.get(0).mapBytes(), releaseId);
        });
    }

    public ReleaseService.ReleaseDetail finalizeRelease(long applicationId, long releaseId) {
        return transaction.execute(status -> {
            lock(applicationId, releaseId);
            var detail = releases.get(applicationId, releaseId);
            if (detail.release().status().equals("finalized")) return detail;
            var maps = findMaps(releaseId);
            boolean complete = maps.size() == detail.artifacts().size() && detail.artifacts().stream().allMatch(artifact -> maps.stream()
                    .anyMatch(map -> map.artifactPath().equals(artifact.artifactPath()) && map.jsSha256().equals(artifact.jsSha256()) && map.mapSha256().equals(artifact.mapSha256())));
            if (!complete) throw new EventApiException(409, "RELEASE_INCOMPLETE", "产物尚未全部上传，不能封存");
            long bytes = maps.stream().mapToLong(MapSummary::mapBytes).sum();
            jdbc.update("UPDATE releases SET status = 'finalized', finalized_at = ?, artifact_count = ?, total_map_bytes = ? WHERE id = ?",
                    System.currentTimeMillis(), maps.size(), bytes, releaseId);
            return releases.get(applicationId, releaseId);
        });
    }

    private void lock(long applicationId, long id) {
        var result = jdbc.query("SELECT id FROM releases WHERE id = ? AND application_id = ? FOR UPDATE", (rs, row) -> rs.getLong("id"), id, applicationId);
        if (result.isEmpty()) throw new EventApiException(404, "RELEASE_NOT_FOUND", "当前应用中没有找到该版本");
    }
    private static void requireDraft(ReleaseService.ReleaseDetail detail) {
        if (!detail.release().status().equals("draft")) throw new EventApiException(409, "RELEASE_FINALIZED", "版本已封存，不能修改产物");
    }
    private List<MapSummary> findMaps(long id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM source_maps WHERE release_id = ? ORDER BY artifact_path", SourceMapService::mapSummary, id);
    }
    private static MapSummary mapSummary(ResultSet rs, int row) throws SQLException {
        return new MapSummary(rs.getLong("id"), rs.getString("artifact_path"), rs.getString("js_sha256"), rs.getString("map_sha256"),
                rs.getLong("js_bytes"), rs.getLong("map_bytes"), rs.getInt("source_count"), rs.getInt("sources_with_content"), rs.getLong("uploaded_by"), rs.getLong("uploaded_at"));
    }
    public record MapSummary(long id, String artifactPath, String jsSha256, String mapSha256, long jsBytes, long mapBytes,
                             int sourceCount, int sourcesWithContent, long uploadedBy, long uploadedAt) { }
    public record UploadResult(MapSummary map, boolean created) { }
}
