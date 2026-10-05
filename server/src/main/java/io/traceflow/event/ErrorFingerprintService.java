package io.traceflow.event;

import io.traceflow.event.EventValidationService.ErrorPayload;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class ErrorFingerprintService {
    static final int VERSION = 2;

    private static final Pattern UUID = Pattern.compile(
            "(?i)\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b");
    private static final Pattern LONG_HEX = Pattern.compile("(?i)\\b[0-9a-f]{8,}\\b");
    private static final Pattern INTEGER = Pattern.compile("(?<![\\w.])-?\\d+(?![\\w.])");
    private static final Pattern STACK_LOCATION = Pattern.compile("(?:(?:\\()|@)?((?:https?://|/)[^()\\s]+):(\\d+):(\\d+)\\)?$");
    private static final Pattern FUNCTION_NAME = Pattern.compile("^\\s*at\\s+([^ (]+)");

    public FingerprintResult fingerprint(ErrorPayload payload) {
        String source;
        if ("resource".equals(payload.mechanism())) {
            source = String.join("\n", "traceflow:resource:v2",
                    valueOr(payload.resourceType(), "unknown"), normalizeFile(payload.filename()));
        } else {
            source = String.join("\n", "traceflow:error:v2", normalizeName(payload.name()),
                    normalizeMessage(payload.message()), canonicalTopFrame(payload));
        }
        return new FingerprintResult(sha256(source), VERSION);
    }

    String normalizeMessage(String message) {
        String normalized = valueOr(message, "Unknown error").trim().replaceAll("\\s+", " ");
        normalized = UUID.matcher(normalized).replaceAll("{uuid}");
        normalized = LONG_HEX.matcher(normalized).replaceAll("{hex}");
        Matcher matcher = INTEGER.matcher(normalized);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            String value = matcher.group();
            int number;
            try {
                number = Integer.parseInt(value);
            } catch (NumberFormatException ignored) {
                number = -1;
            }
            String replacement = number >= 100 && number <= 599 ? value : "{number}";
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.length() <= 500 ? result.toString() : result.substring(0, 500);
    }

    String canonicalTopFrame(ErrorPayload payload) {
        if (payload.stack() != null) {
            for (String line : payload.stack().lines().skip(1).toList()) {
                if (line.contains("traceflow-web-sdk") || line.contains("/api/v1/events/batch")) continue;
                Matcher location = STACK_LOCATION.matcher(line.trim());
                if (!location.find()) continue;
                Matcher function = FUNCTION_NAME.matcher(line);
                String functionName = function.find() ? function.group(1) : "<anonymous>";
                return functionName + '|' + normalizeFile(location.group(1)) + '|'
                        + location.group(2) + '|' + location.group(3);
            }
        }
        if (payload.filename() != null && !payload.filename().isBlank()) {
            return "<anonymous>|" + normalizeFile(payload.filename()) + '|'
                    + valueOr(payload.lineno(), 0) + '|' + valueOr(payload.colno(), 0);
        }
        return "<no-frame>";
    }

    private String normalizeName(String name) {
        String normalized = valueOr(name, "Error").trim();
        if (normalized.isEmpty()) normalized = "Error";
        return normalized.length() <= 100 ? normalized : normalized.substring(0, 100);
    }

    private String normalizeFile(String value) {
        if (value == null || value.isBlank()) return "<unknown>";
        try {
            URI uri = URI.create(value);
            String path = uri.getPath();
            return path == null || path.isBlank() ? "/" : path;
        } catch (IllegalArgumentException ignored) {
            int query = value.indexOf('?');
            int hash = value.indexOf('#');
            int end = query < 0 ? value.length() : query;
            if (hash >= 0) end = Math.min(end, hash);
            return value.substring(0, end);
        }
    }

    private String sha256(String source) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private <T> T valueOr(T value, T fallback) {
        return value == null ? fallback : value;
    }

    public record FingerprintResult(String value, int version) {
    }
}
