package io.traceflow.release;

import tools.jackson.databind.JsonNode;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import static io.traceflow.release.StacktraceResponse.*;

public final class StacktraceParser {
    private static final Pattern FRAME = Pattern.compile("^\\s*at\\s+(?:(.*?)\\s+\\((.*)\\)|(.*))\\s*$");
    private static final Pattern POSITION = Pattern.compile("^(.*):([0-9]+):([0-9]+)$");
    private StacktraceParser() { }

    public static ParsedStack parse(JsonNode payload) {
        List<ParsedFrame> frames = new ArrayList<>();
        String stack = payload.path("stack").isString() ? payload.path("stack").stringValue() : "";
        boolean truncated = stack.length() > 32768;
        if (truncated) stack = stack.substring(0, 32768);
        var lines = stack.lines().toList();
        for (int i = 0; i < lines.size(); i++) {
            String raw = lines.get(i);
            if (raw.isBlank()) continue;
            if (i == 0 && !FRAME.matcher(raw).matches() && !raw.contains("@")) continue;
            if (frames.size() == 50) { truncated = true; break; }
            var matcher = FRAME.matcher(raw);
            if (!matcher.matches()) frames.add(new ParsedFrame(clip(raw, 2048), new Generated(null, null, null, null), null, "UNSUPPORTED_FRAME"));
            else frames.add(location(raw, matcher.group(1), matcher.group(2) != null ? matcher.group(2) : matcher.group(3)));
        }
        if (frames.stream().noneMatch(frame -> frame.reason() == null) && payload.path("filename").isString()) {
            if (frames.size() < 50) {
                Integer line = positive(payload.path("lineno")), column = positive(payload.path("colno"));
                String filename = payload.path("filename").stringValue();
                frames.add(fromPosition(clip(filename, 2048), new Generated(null, clip(filename, 2048), line, column)));
            } else truncated = true;
        }
        return new ParsedStack(List.copyOf(frames), truncated);
    }

    private static ParsedFrame location(String raw, String function, String location) {
        var match = POSITION.matcher(location);
        if (!match.matches()) return new ParsedFrame(clip(raw, 2048), new Generated(clip(function, 256), clip(location, 2048), null, null), null, "MISSING_POSITION");
        Integer line = integer(match.group(2)), column = integer(match.group(3));
        return fromPosition(clip(raw, 2048), new Generated(clip(function, 256), clip(match.group(1), 2048), line, column));
    }

    private static ParsedFrame fromPosition(String raw, Generated generated) {
        if (generated.line() == null || generated.column() == null) return new ParsedFrame(raw, generated, null, "MISSING_POSITION");
        try {
            var uri = new URI(generated.filename());
            if ((!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null)
                return new ParsedFrame(raw, generated, null, "UNSUPPORTED_FRAME");
            return new ParsedFrame(raw, generated, ArtifactPath.normalize(uri.getRawPath()), null);
        } catch (Exception exception) { return new ParsedFrame(raw, generated, null, "UNSUPPORTED_FRAME"); }
    }

    private static Integer positive(JsonNode value) {
        return value.isInt() && value.intValue() > 0 ? value.intValue() : null;
    }
    private static Integer integer(String text) {
        try { int value = Integer.parseInt(text); return value > 0 ? value : null; }
        catch (NumberFormatException exception) { return null; }
    }
    public static String clip(String value, int limit) {
        if (value == null || value.length() <= limit) return value;
        int end = Character.isHighSurrogate(value.charAt(limit - 1)) ? limit - 1 : limit;
        return value.substring(0, end);
    }
    public record ParsedFrame(String raw, Generated generated, String artifactPath, String reason) { }
    public record ParsedStack(List<ParsedFrame> frames, boolean truncated) { }
}
