package io.traceflow.release;

import com.google.debugging.sourcemap.SourceMapConsumerV3;
import io.traceflow.event.EventApiException;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.Semaphore;

@Component
public class SourceMapValidator {
    public static final int MAX_FILE_BYTES = 5 * 1024 * 1024;
    private final Semaphore capacity = new Semaphore(2);
    private final ObjectMapper mapper = new ObjectMapper(JsonFactory.builder().streamReadConstraints(
            StreamReadConstraints.builder().maxNestingDepth(20).maxStringLength(MAX_FILE_BYTES).build()).build());

    public PreparedUpload prepare(String path, MultipartFile javascript, MultipartFile sourceMap) {
        String normalized = ArtifactPath.normalize(path);
        if (javascript.isEmpty() || sourceMap.isEmpty()) throw invalid("JS 和 Source Map 文件不能为空");
        if (javascript.getSize() > MAX_FILE_BYTES || sourceMap.getSize() > MAX_FILE_BYTES)
            throw new EventApiException(413, "UPLOAD_TOO_LARGE", "单个 JS 或 Map 文件不能超过 5 MiB");
        if (!capacity.tryAcquire()) throw new EventApiException(429, "SOURCE_MAP_BUSY", "Source Map 校验繁忙，请稍后重试");
        try {
            byte[] js = javascript.getBytes();
            byte[] map = sourceMap.getBytes();
            decodeUtf8(js);
            var parsed = parseDocument(normalized, map);
            return new PreparedUpload(normalized, sha256(normalized.getBytes(StandardCharsets.UTF_8)), sha256(js), sha256(map),
                    js.length, map, parsed.root().get("sources").size(), parsed.sourcesWithContent());
        } catch (EventApiException exception) { throw exception; }
        catch (Exception exception) { throw invalid("Source Map 格式、UTF-8 编码或映射数据无效"); }
        finally { capacity.release(); }
    }

    public ParsedMap parseStored(String path, byte[] bytes) {
        if (bytes.length == 0 || bytes.length > MAX_FILE_BYTES) throw invalid("已保存 Map 大小无效");
        if (!capacity.tryAcquire()) throw new EventApiException(429, "SOURCE_MAP_BUSY", "Source Map 解析繁忙，请稍后重试");
        try { return parseDocument(ArtifactPath.normalize(path), bytes); }
        catch (EventApiException exception) { throw exception; }
        catch (Exception exception) { throw invalid("已保存 Map 无法解析"); }
        finally { capacity.release(); }
    }

    private ParsedMap parseDocument(String normalized, byte[] bytes) throws Exception {
        String json = decodeUtf8(bytes);
        JsonNode root = mapper.readTree(json);
        if (root == null || !root.isObject()) throw invalid("Source Map 必须是 JSON 对象");
        if (root.has("sections")) throw new EventApiException(400, "UNSUPPORTED_SOURCE_MAP", "首轮不支持 indexed Source Map");
        if (!root.path("version").isInt() || root.path("version").intValue() != 3)
            throw invalid("仅支持 Source Map v3");
        validateStrings(root.path("sources"), "sources");
        validateStrings(root.path("names"), "names");
        if (!root.path("mappings").isString()) throw invalid("mappings 必须为字符串");
        if (root.has("sourceRoot") && !root.get("sourceRoot").isString()) throw invalid("sourceRoot 必须为字符串");
        if (root.has("file")) {
            String filename = java.net.URI.create("https://traceflow.invalid" + normalized).getPath();
            filename = filename.substring(filename.lastIndexOf('/') + 1);
            if (!root.get("file").isString() || !root.get("file").stringValue().equals(filename))
                throw invalid("Map 的 file 与 JS 资源文件名不一致");
        }
        int withContent = 0;
        if (root.has("sourcesContent")) {
            JsonNode content = root.get("sourcesContent");
            if (!content.isArray() || content.size() != root.get("sources").size()) throw invalid("sourcesContent 必须与 sources 等长");
            for (JsonNode value : content) {
                if (!value.isNull() && !value.isString()) throw invalid("sourcesContent 元素必须是字符串或 null");
                if (value.isString()) withContent++;
            }
        }
        String mappings = root.get("mappings").stringValue();
        int segments = 0, lines = 1;
        boolean entry = false;
        for (int i = 0; i < mappings.length(); i++) {
            char value = mappings.charAt(i);
            if (value == ';' || value == ',') { entry = false; if (value == ';') lines++; }
            else if (!entry) { segments++; entry = true; }
            if (segments > 500000 || lines > 200000) throw invalid("Source Map 映射数量超过上限");
        }
        // Pass only the supported fields to the library; never resolve sections or remote source URLs.
        var consumerInput = mapper.createObjectNode();
        for (String field : new String[]{"version", "file", "sources", "names", "mappings", "sourcesContent", "sourceRoot"})
            if (root.has(field)) consumerInput.set(field, root.get(field));
        var consumer = new SourceMapConsumerV3();
        consumer.parse(mapper.writeValueAsString(consumerInput));
        consumer.visitMappings((source, name, original, generated, end) -> {
            if (original.getLine() < 0 || original.getColumn() < 0 || generated.getLine() < 0 || generated.getColumn() < 0)
                throw invalid("Source Map 包含无效坐标");
        });
        return new ParsedMap(consumer, root, withContent);
    }

    public record ParsedMap(SourceMapConsumerV3 consumer, JsonNode root, int sourcesWithContent) { }

    private static void validateStrings(JsonNode array, String field) {
        if (!array.isArray() || array.size() > 20000) throw invalid(field + " 必须为至多 20000 项字符串数组");
        for (JsonNode value : array) if (!value.isString()) throw invalid(field + " 元素必须为字符串");
    }

    private static String decodeUtf8(byte[] bytes) throws java.nio.charset.CharacterCodingException {
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
    }

    public static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    private static EventApiException invalid(String message) { return new EventApiException(400, "INVALID_SOURCE_MAP", message); }
    public record PreparedUpload(String path, String pathHash, String jsHash, String mapHash, long jsBytes,
                                 byte[] mapContent, int sourceCount, int sourcesWithContent) { }
}
