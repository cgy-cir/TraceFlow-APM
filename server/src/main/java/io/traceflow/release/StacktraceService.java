package io.traceflow.release;

import io.traceflow.event.EventApiException;
import io.traceflow.event.EventEntity;
import io.traceflow.event.EventMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import static io.traceflow.release.StacktraceResponse.*;

@Service
public class StacktraceService {
    public static final int PARSER_VERSION = 1;
    private final EventMapper events;
    private final JdbcTemplate jdbc;
    private final ReleaseService releases;
    private final SourceMapValidator validator;
    private final ObjectMapper mapper;
    private final StacktraceCache cache = new StacktraceCache();
    private final Semaphore capacity = new Semaphore(2);
    private final ConcurrentHashMap<StacktraceCache.Key, CompletableFuture<StacktraceResponse>> inFlight = new ConcurrentHashMap<>();

    public StacktraceService(EventMapper events, JdbcTemplate jdbc, ReleaseService releases, SourceMapValidator validator, ObjectMapper mapper) {
        this.events = events; this.jdbc = jdbc; this.releases = releases; this.validator = validator; this.mapper = mapper;
    }

    public StacktraceResponse get(long applicationId, long eventId) {
        EventEntity event = events.findById(applicationId, eventId);
        if (event == null) throw new EventApiException(404, "EVENT_NOT_FOUND", "当前应用中没有找到该事件");
        JsonNode payload;
        try { payload = mapper.readTree(event.getPayload()); }
        catch (Exception exception) { return response(event, null, List.of(), Set.of("INVALID_EVENT_PAYLOAD"), false); }
        if (payload == null || !payload.isObject()) return response(event, null, List.of(), Set.of("INVALID_EVENT_PAYLOAD"), false);
        if (!"error".equals(event.getType()) || "resource".equals(payload.path("mechanism").asString()))
            return new StacktraceResponse(eventId, event.getReleaseName(), null, "not_applicable", PARSER_VERSION, List.of(), List.of(), false);
        var stack = StacktraceParser.parse(payload);
        if (event.getReleaseName() == null || event.getReleaseName().isBlank()) return unavailable(event, null, stack, "MISSING_RELEASE");
        var releaseIds = jdbc.query("SELECT id FROM releases WHERE application_id = ? AND release_name = ?",
                (rs, row) -> rs.getLong("id"), applicationId, event.getReleaseName());
        if (releaseIds.isEmpty()) return unavailable(event, null, stack, "RELEASE_NOT_FOUND");
        var release = releases.get(applicationId, releaseIds.get(0));
        if (!release.release().status().equals("finalized")) return unavailable(event, release.release().id(), stack, "RELEASE_NOT_FINALIZED");
        String digest = SourceMapValidator.sha256(mapper.writeValueAsString(release.artifacts()).getBytes(StandardCharsets.UTF_8));
        var key = new StacktraceCache.Key(applicationId, eventId, release.release().id(), digest, PARSER_VERSION);
        var cached = cache.get(key);
        if (cached != null) return cached;
        var future = new CompletableFuture<StacktraceResponse>();
        var previous = inFlight.putIfAbsent(key, future);
        if (previous != null) {
            try { return previous.get(10, java.util.concurrent.TimeUnit.SECONDS); }
            catch (java.util.concurrent.ExecutionException exception) {
                if (exception.getCause() instanceof RuntimeException cause) throw cause;
                throw busy();
            } catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw busy(); }
            catch (java.util.concurrent.TimeoutException exception) { throw busy(); }
        }
        boolean acquired = capacity.tryAcquire();
        try {
            if (!acquired) throw busy();
            // A competing request may have completed after our initial cache lookup.
            cached = cache.get(key);
            var result = cached != null ? cached : resolve(event, release, stack);
            if (result.diagnostics().stream().noneMatch(item -> Set.of("SOURCE_MAP_UNAVAILABLE", "SOURCE_MAP_NOT_FOUND").contains(item.code())))
                cache.put(key, result, mapper.writeValueAsBytes(result).length);
            future.complete(result);
            return result;
        } catch (RuntimeException exception) { future.completeExceptionally(exception); throw exception; }
        finally { if (acquired) capacity.release(); inFlight.remove(key, future); }
    }

    private StacktraceResponse resolve(EventEntity event, ReleaseService.ReleaseDetail release, StacktraceParser.ParsedStack stack) {
        Frame[] frames = new Frame[stack.frames().size()];
        var groups = new LinkedHashMap<String, List<Integer>>();
        for (int i = 0; i < frames.length; i++) {
            var input = stack.frames().get(i);
            if (input.reason() != null) frames[i] = failure(i, input, input.reason());
            else groups.computeIfAbsent(input.artifactPath(), ignored -> new ArrayList<>()).add(i);
        }
        int mapCount = 0;
        for (var group : groups.entrySet()) {
            var expected = release.artifacts().stream().filter(item -> item.artifactPath().equals(group.getKey())).findFirst();
            if (expected.isEmpty()) { failGroup(frames, stack, group.getValue(), "SOURCE_MAP_NOT_FOUND"); continue; }
            if (mapCount >= 10) { failGroup(frames, stack, group.getValue(), "MAP_LIMIT_EXCEEDED"); continue; }
            var rows = jdbc.query("SELECT artifact_path, js_sha256, map_sha256, js_bytes, map_bytes, map_content FROM source_maps WHERE release_id = ? AND artifact_path_hash = ?",
                    (rs, row) -> new StoredMap(rs.getString("artifact_path"), rs.getString("js_sha256"), rs.getString("map_sha256"), rs.getLong("js_bytes"), rs.getLong("map_bytes"), rs.getBytes("map_content")),
                    release.release().id(), SourceMapValidator.sha256(group.getKey().getBytes(StandardCharsets.UTF_8)));
            if (rows.isEmpty()) { failGroup(frames, stack, group.getValue(), "SOURCE_MAP_NOT_FOUND"); continue; }
            var stored = rows.get(0);
            if (!stored.path().equals(group.getKey()) || !stored.jsHash().equals(expected.get().jsSha256()) || !stored.mapHash().equals(expected.get().mapSha256())
                    || stored.bytes() != stored.content().length || stored.bytes() > SourceMapValidator.MAX_FILE_BYTES || stored.jsBytes() < 1 || stored.jsBytes() > SourceMapValidator.MAX_FILE_BYTES
                    || !SourceMapValidator.sha256(stored.content()).equals(stored.mapHash())) {
                failGroup(frames, stack, group.getValue(), "SOURCE_MAP_UNAVAILABLE"); continue;
            }
            try {
                mapCount++;
                // Only one Map consumer lives in this iteration, rather than retaining all Maps for a large stack.
                var parsed = validator.parseStored(group.getKey(), stored.content());
                for (int index : group.getValue()) {
                    var input = stack.frames().get(index);
                    if (input.generated().line() > stored.jsBytes() + 1 || input.generated().column() > stored.jsBytes() + 1) {
                        frames[index] = failure(index, input, "NO_MAPPING"); continue;
                    }
                    var mapping = parsed.consumer().getMappingForLine(input.generated().line(), input.generated().column());
                    if (mapping == null || mapping.getPrecision() != com.google.debugging.sourcemap.proto.Mapping.OriginalMapping.Precision.EXACT
                            || mapping.getLineNumber() < 1 || mapping.getColumnPosition() < 1) {
                        frames[index] = failure(index, input, "NO_MAPPING"); continue;
                    }
                    String function = mapping.getIdentifier().isEmpty() ? input.generated().functionName() : mapping.getIdentifier();
                    var context = context(parsed.root(), mapping.getOriginalFile(), mapping.getLineNumber());
                    String root = parsed.root().path("sourceRoot").asString("");
                    String filename = root.isEmpty() ? mapping.getOriginalFile() : root + (root.endsWith("/") ? "" : "/") + mapping.getOriginalFile();
                    var original = new Original(StacktraceParser.clip(function, 256), StacktraceParser.clip(filename, 1024), mapping.getLineNumber(), mapping.getColumnPosition(), context.lines(), context.reason());
                    frames[index] = new Frame(index, input.raw(), "resolved", null, input.generated(), original);
                }
            } catch (EventApiException exception) {
                if (exception.getStatus() == 429) throw exception;
                failGroup(frames, stack, group.getValue(), "SOURCE_MAP_UNAVAILABLE");
            } catch (RuntimeException exception) { failGroup(frames, stack, group.getValue(), "SOURCE_MAP_UNAVAILABLE"); }
        }
        var reasons = new LinkedHashSet<String>();
        if (frames.length == 0) reasons.add("MISSING_POSITION");
        return response(event, release.release().id(), List.of(frames), reasons, stack.truncated());
    }

    private static Context context(JsonNode root, String source, int line) {
        String content = null;
        JsonNode sources = root.path("sources"), contents = root.path("sourcesContent");
        for (int i = 0; i < sources.size(); i++) {
            if (!source.equals(sources.get(i).stringValue())) continue;
            var node = contents.path(i);
            if (!node.isString()) continue;
            if (content != null && !content.equals(node.stringValue())) return new Context(List.of(), "AMBIGUOUS_SOURCE");
            content = node.stringValue();
        }
        if (content == null) return new Context(List.of(), "SOURCE_CONTENT_MISSING");
        List<ContextLine> lines = new ArrayList<>();
        int position = 0, number = 1;
        while (position <= content.length() && number <= (long) line + 3) {
            int end = content.indexOf('\n', position);
            if (end == -1) end = content.length();
            if (number >= Math.max(1, line - 3)) {
                int textEnd = end > position && content.charAt(end - 1) == '\r' ? end - 1 : end;
                int clippedEnd = Math.min(textEnd, position + 500);
                if (clippedEnd > position && clippedEnd < textEnd && Character.isHighSurrogate(content.charAt(clippedEnd - 1))) clippedEnd--;
                String text = content.substring(position, clippedEnd);
                lines.add(new ContextLine(number, text, number == line));
            }
            if (end == content.length()) break;
            position = end + 1; number++;
        }
        if (lines.stream().noneMatch(ContextLine::isErrorLine)) return new Context(List.of(), "SOURCE_POSITION_OUT_OF_RANGE");
        return new Context(List.copyOf(lines), null);
    }

    private StacktraceResponse unavailable(EventEntity event, Long releaseId, StacktraceParser.ParsedStack stack, String reason) {
        List<Frame> frames = new ArrayList<>();
        for (int i = 0; i < stack.frames().size(); i++) {
            var input = stack.frames().get(i);
            frames.add(failure(i, input, input.reason() == null ? reason : input.reason()));
        }
        return response(event, releaseId, frames, Set.of(reason), stack.truncated());
    }

    private StacktraceResponse response(EventEntity event, Long releaseId, List<Frame> input, Set<String> initial, boolean truncated) {
        var frames = new ArrayList<>(input);
        var reasons = new LinkedHashSet<>(initial);
        if (truncated) reasons.add("FRAME_LIMIT_EXCEEDED");
        var result = assemble(event, releaseId, frames, reasons, truncated);
        if (mapper.writeValueAsBytes(result).length > 256 * 1024) {
            reasons.add("RESPONSE_LIMIT_EXCEEDED"); truncated = true;
            for (int i = frames.size() - 1; i >= 0 && mapper.writeValueAsBytes(result).length > 256 * 1024; i--) {
                Frame frame = frames.get(i);
                if (frame.original() != null) {
                    Original original = frame.original();
                    frames.set(i, new Frame(frame.index(), frame.raw(), frame.status(), frame.reason(), frame.generated(),
                            new Original(original.functionName(), original.filename(), original.line(), original.column(), List.of(), "RESPONSE_LIMIT_EXCEEDED")));
                }
                result = assemble(event, releaseId, frames, reasons, truncated);
            }
            while (mapper.writeValueAsBytes(result).length > 256 * 1024 && !frames.isEmpty()) {
                frames.remove(frames.size() - 1);
                result = assemble(event, releaseId, frames, reasons, truncated);
            }
        }
        return result;
    }

    private static StacktraceResponse assemble(EventEntity event, Long releaseId, List<Frame> frames, Set<String> initial, boolean truncated) {
        var reasons = new LinkedHashSet<>(initial);
        for (Frame frame : frames) {
            if (frame.reason() != null) reasons.add(frame.reason());
            if (frame.original() != null && frame.original().contextReason() != null) reasons.add(frame.original().contextReason());
        }
        long resolved = frames.stream().filter(frame -> frame.original() != null).count();
        String status = resolved == 0 ? "unresolved" : resolved == frames.size() && !truncated ? "resolved" : "partial";
        return new StacktraceResponse(event.getId(), event.getReleaseName(), releaseId, status, PARSER_VERSION, List.copyOf(frames),
                reasons.stream().map(code -> new Diagnostic(code, message(code))).toList(), truncated);
    }
    private static Frame failure(int index, StacktraceParser.ParsedFrame input, String reason) {
        return new Frame(index, input.raw(), "unresolved", reason, input.generated(), null);
    }
    private static void failGroup(Frame[] frames, StacktraceParser.ParsedStack stack, List<Integer> indexes, String reason) {
        for (int index : indexes) frames[index] = failure(index, stack.frames().get(index), reason);
    }
    private static EventApiException busy() { return new EventApiException(429, "SOURCE_MAP_BUSY", "源码定位繁忙，请稍后重试"); }
    public static String message(String code) {
        return switch (code) {
            case "MISSING_RELEASE" -> "事件未携带版本名称";
            case "RELEASE_NOT_FOUND" -> "该应用尚未注册此版本";
            case "RELEASE_NOT_FINALIZED" -> "版本尚未封存，暂不进行源码定位";
            case "SOURCE_MAP_NOT_FOUND" -> "没有找到该 JS 路径对应的 Source Map";
            case "SOURCE_MAP_UNAVAILABLE" -> "已保存 Map 无法通过完整性检查或解析";
            case "UNSUPPORTED_FRAME" -> "首轮不支持该堆栈格式或脚本地址";
            case "MISSING_POSITION" -> "缺少可定位的文件、行号或列号";
            case "NO_MAPPING" -> "此生成位置没有源码映射";
            case "SOURCE_CONTENT_MISSING" -> "已还原位置，但 Map 未包含对应源码内容";
            case "SOURCE_POSITION_OUT_OF_RANGE" -> "源码内容不包含还原后的行号";
            case "AMBIGUOUS_SOURCE" -> "Map 包含同名但内容不同的源码，不能确定代码片段";
            case "FRAME_LIMIT_EXCEEDED" -> "堆栈超过首轮处理范围，保留原始堆栈查看完整内容";
            case "MAP_LIMIT_EXCEEDED" -> "单事件最多解析 10 个不同 Map";
            case "RESPONSE_LIMIT_EXCEEDED" -> "定位响应过大，部分代码片段或帧已省略";
            default -> "事件内容无法用于源码定位";
        };
    }
    private record StoredMap(String path, String jsHash, String mapHash, long jsBytes, long bytes, byte[] content) { }
    private record Context(List<ContextLine> lines, String reason) { }
}
