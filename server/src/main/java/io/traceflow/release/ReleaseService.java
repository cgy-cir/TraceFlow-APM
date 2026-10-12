package io.traceflow.release;

import io.traceflow.event.EventApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;

@Service
public class ReleaseService {
    private static final String COLUMNS = "id, application_id, release_name, commit_sha, status, "
            + "JSON_LENGTH(manifest) AS expected_artifact_count, artifact_count, total_map_bytes, created_by, created_at, finalized_at, deployed_at";
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public ReleaseService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public ReleaseList list(long applicationId, String query, String status, int page, int pageSize) {
        requireApplication(applicationId, false);
        if (page < 1 || page > 10000 || pageSize < 1 || pageSize > 100 || query != null && query.length() > 100)
            throw new EventApiException(400, "INVALID_FILTER", "分页或搜索条件无效");
        if (status != null && !status.equals("draft") && !status.equals("finalized"))
            throw new EventApiException(400, "INVALID_FILTER", "版本状态无效");
        StringBuilder where = new StringBuilder(" WHERE application_id = ?");
        List<Object> args = new ArrayList<>(List.of(applicationId));
        if (query != null && !query.isBlank()) {
            where.append(" AND LOCATE(?, release_name) > 0");
            args.add(query);
        }
        if (status != null) { where.append(" AND status = ?"); args.add(status); }
        long total = jdbc.queryForObject("SELECT COUNT(*) FROM releases" + where, Long.class, args.toArray());
        args.add(pageSize); args.add((page - 1) * pageSize);
        var items = jdbc.query("SELECT " + COLUMNS + " FROM releases" + where + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                ReleaseService::mapSummary, args.toArray());
        return new ReleaseList(items, total, page, pageSize);
    }

    public ReleaseDetail get(long applicationId, long id) {
        requireApplication(applicationId, false);
        var releases = jdbc.query("SELECT " + COLUMNS + ", manifest FROM releases WHERE application_id = ? AND id = ?",
                (rs, row) -> new ReleaseDetail(mapSummary(rs, row), readManifest(rs.getString("manifest"))), applicationId, id);
        if (releases.isEmpty()) throw new EventApiException(404, "RELEASE_NOT_FOUND", "当前应用中没有找到该版本");
        return releases.get(0);
    }

    @Transactional
    public CreateResult create(ReleaseApi.CreateReleaseRequest request, long creator) {
        var artifacts = canonicalManifest(request);
        // Lock the application so concurrent creates share one identity check before inserting.
        requireApplication(request.applicationId(), true);
        var existing = jdbc.query("SELECT id FROM releases WHERE application_id = ? AND release_name = ?",
                (rs, row) -> rs.getLong("id"), request.applicationId(), request.releaseName());
        String commit = request.commitSha() == null ? null : request.commitSha().toLowerCase(java.util.Locale.ROOT);
        if (!existing.isEmpty()) {
            var release = get(request.applicationId(), existing.get(0));
            if (!java.util.Objects.equals(commit, release.release().commitSha()) || !artifacts.equals(release.artifacts()))
                throw new EventApiException(409, "RELEASE_CONFLICT", "该版本名已绑定不同的 commit 或产物清单，请使用新的版本名");
            return new CreateResult(release, false);
        }
        long now = System.currentTimeMillis();
        var keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("""
                    INSERT INTO releases (application_id, release_name, commit_sha, manifest, created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, request.applicationId()); statement.setString(2, request.releaseName());
            statement.setString(3, commit); statement.setString(4, mapper.writeValueAsString(artifacts));
            statement.setLong(5, creator); statement.setLong(6, now);
            return statement;
        }, keys);
        return new CreateResult(get(request.applicationId(), keys.getKey().longValue()), true);
    }

    @Transactional
    public ReleaseDetail registerDeployment(long applicationId, long id, long deployedAt) {
        // Serialize first-deployment writes with upload/finalization using the same scoped release lock.
        var locked = jdbc.query("SELECT id FROM releases WHERE application_id = ? AND id = ? FOR UPDATE",
                (rs, row) -> rs.getLong("id"), applicationId, id);
        if (locked.isEmpty()) throw new EventApiException(404, "RELEASE_NOT_FOUND", "当前应用中没有找到该版本");
        var detail = get(applicationId, id);
        var release = detail.release();
        if (!release.status().equals("finalized"))
            throw new EventApiException(409, "RELEASE_NOT_FINALIZED", "请先封存版本再登记部署时间");
        if (release.deployedAt() != null) {
            if (release.deployedAt() != deployedAt)
                throw new EventApiException(409, "DEPLOYMENT_CONFLICT", "首次部署时间已登记，不能修改");
            return detail;
        }
        if (deployedAt <= 0 || deployedAt < release.finalizedAt() || deployedAt > System.currentTimeMillis() + 60_000)
            throw new EventApiException(400, "INVALID_DEPLOYMENT_TIME", "部署时间须为毫秒时间戳，不早于封存时间且不能超过当前时间一分钟");
        jdbc.update("UPDATE releases SET deployed_at = ? WHERE application_id = ? AND id = ?", deployedAt, applicationId, id);
        return get(applicationId, id);
    }

    static List<ReleaseApi.ArtifactInput> canonicalManifest(ReleaseApi.CreateReleaseRequest request) {
        String name = request.releaseName();
        if (name == null || name.isBlank() || name.length() > 100 || !name.equals(name.strip())
                || name.codePoints().anyMatch(value -> Character.isISOControl(value)
                    || (Character.isWhitespace(value) || Character.isSpaceChar(value)) && value != ' '))
            throw new EventApiException(400, "INVALID_RELEASE", "版本名不能为空、超过 100 字符或包含首尾空白和控制字符");
        if (request.applicationId() <= 0 || request.commitSha() != null && !request.commitSha().matches("[a-fA-F0-9]{40}|[a-fA-F0-9]{64}"))
            throw new EventApiException(400, "INVALID_RELEASE", "应用或 commit SHA 无效");
        if (request.artifacts() == null || request.artifacts().isEmpty() || request.artifacts().size() > 100)
            throw new EventApiException(400, "INVALID_MANIFEST", "产物清单须包含 1 到 100 个 JS 文件");
        var paths = new HashSet<String>();
        var result = new ArrayList<ReleaseApi.ArtifactInput>();
        for (var artifact : request.artifacts()) {
            if (artifact == null || artifact.jsSha256() == null || !artifact.jsSha256().matches("[a-f0-9]{64}")
                    || artifact.mapSha256() == null || !artifact.mapSha256().matches("[a-f0-9]{64}"))
                throw new EventApiException(400, "INVALID_MANIFEST", "JS 和 Map 摘要须为 64 位小写十六进制 SHA-256");
            String path = ArtifactPath.normalize(artifact.artifactPath());
            if (!paths.add(path)) throw new EventApiException(400, "INVALID_MANIFEST", "产物清单包含重复资源路径");
            result.add(new ReleaseApi.ArtifactInput(path, artifact.jsSha256(), artifact.mapSha256()));
        }
        result.sort(Comparator.comparing(ReleaseApi.ArtifactInput::artifactPath));
        return List.copyOf(result);
    }

    private void requireApplication(long id, boolean lock) {
        var applications = jdbc.query("SELECT id FROM applications WHERE id = ?" + (lock ? " FOR UPDATE" : ""),
                (rs, row) -> rs.getLong("id"), id);
        if (applications.isEmpty()) throw new EventApiException(404, "APPLICATION_NOT_FOUND", "应用不存在");
    }

    private List<ReleaseApi.ArtifactInput> readManifest(String json) {
        return List.of(mapper.readValue(json, ReleaseApi.ArtifactInput[].class));
    }

    private static ReleaseSummary mapSummary(ResultSet rs, int row) throws SQLException {
        return new ReleaseSummary(rs.getLong("id"), rs.getLong("application_id"), rs.getString("release_name"),
                rs.getString("commit_sha"), rs.getString("status"), rs.getInt("expected_artifact_count"),
                rs.getInt("artifact_count"), rs.getLong("total_map_bytes"), rs.getLong("created_by"), rs.getLong("created_at"),
                rs.getObject("finalized_at", Long.class), rs.getObject("deployed_at", Long.class));
    }

    public record ReleaseSummary(long id, long applicationId, String releaseName, String commitSha, String status,
                                 int expectedArtifactCount, int artifactCount, long totalMapBytes, long createdBy,
                                 long createdAt, Long finalizedAt, Long deployedAt) { }
    public record ReleaseDetail(ReleaseSummary release, List<ReleaseApi.ArtifactInput> artifacts) { }
    public record ReleaseList(List<ReleaseSummary> items, long total, int page, int pageSize) { }
    public record CreateResult(ReleaseDetail detail, boolean created) { }
}
