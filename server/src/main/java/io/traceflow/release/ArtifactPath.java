package io.traceflow.release;

import io.traceflow.event.EventApiException;
import java.nio.charset.StandardCharsets;

public final class ArtifactPath {
    private ArtifactPath() { }

    public static String normalize(String path) {
        if (path == null || !path.startsWith("/") || path.length() > 1024) throw invalid();
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < path.length();) {
            int character = path.codePointAt(i);
            i += Character.charCount(character);
            if (character <= 32 || Character.isISOControl(character) || character == '\\' || character == '?' || character == '#'
                    || character >= 0xD800 && character <= 0xDFFF) throw invalid();
            if (character == '%') {
                if (i + 1 >= path.length()) throw invalid();
                int high = Character.digit(path.charAt(i), 16);
                int low = Character.digit(path.charAt(i + 1), 16);
                if (high < 0 || low < 0 || path.charAt(i) > 127 || path.charAt(i + 1) > 127) throw invalid();
                int value = high * 16 + low;
                if (value <= 32 || value == 127 || value == '/' || value == '\\' || value == '%') throw invalid();
                if (unreserved(value)) result.append((char) value);
                else result.append(String.format("%%%02X", value));
                i += 2;
            } else if (character > 127) {
                for (byte value : new String(Character.toChars(character)).getBytes(StandardCharsets.UTF_8)) {
                    result.append(String.format("%%%02X", value & 255));
                }
            } else if (unreserved(character) || "/:@!$&'()*+,;=".indexOf(character) >= 0) result.append((char) character);
            else throw invalid();
        }
        String normalized = result.toString();
        for (String segment : normalized.split("/", -1)) {
            if (segment.equals(".") || segment.equals("..")) throw invalid();
        }
        if (normalized.length() > 1024 || !normalized.endsWith(".js")) throw invalid();
        var bytes = new java.io.ByteArrayOutputStream();
        for (int i = 0; i < normalized.length(); i++) {
            if (normalized.charAt(i) == '%') {
                bytes.write(Integer.parseInt(normalized.substring(i + 1, i + 3), 16));
                i += 2;
            } else bytes.write(normalized.charAt(i));
        }
        try {
            var decoded = StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(bytes.toByteArray()));
            if (decoded.codePoints().anyMatch(Character::isISOControl)) throw invalid();
        } catch (java.nio.charset.CharacterCodingException exception) { throw invalid(); }
        return normalized;
    }

    private static boolean unreserved(int value) {
        return value >= 'a' && value <= 'z' || value >= 'A' && value <= 'Z'
                || value >= '0' && value <= '9' || value == '-' || value == '.' || value == '_' || value == '~';
    }

    private static EventApiException invalid() {
        return new EventApiException(400, "INVALID_ARTIFACT_PATH", "资源路径须为以 / 开头的完整 JS 路径，不能包含穿越、查询参数或非法编码");
    }
}
