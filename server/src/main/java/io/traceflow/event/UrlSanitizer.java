package io.traceflow.event;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class UrlSanitizer {
    private static final Set<String> SENSITIVE_KEYS = Set.of(
            "token", "access_token", "code", "password", "secret", "authorization", "session");

    public String sanitize(String value) {
        if (value == null || value.isBlank()) return value;
        try {
            URI uri = URI.create(value);
            String query = uri.getRawQuery();
            if (query == null) return withoutUserInfo(uri).toString();
            String sanitizedQuery = Arrays.stream(query.split("&"))
                    .map(this::sanitizePair)
                    .collect(Collectors.joining("&"));
            URI base = new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), uri.getRawPath(), null, null);
            String fragment = uri.getRawFragment() == null ? "" : "#" + uri.getRawFragment();
            return base + "?" + sanitizedQuery + fragment;
        } catch (IllegalArgumentException | URISyntaxException ignored) {
            return value;
        }
    }

    private URI withoutUserInfo(URI uri) throws URISyntaxException {
        return new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), uri.getRawPath(), uri.getRawQuery(), uri.getRawFragment());
    }

    private String sanitizePair(String pair) {
        int separator = pair.indexOf('=');
        String key = separator >= 0 ? pair.substring(0, separator) : pair;
        if (SENSITIVE_KEYS.contains(key.toLowerCase(Locale.ROOT))) return key + "=%5BFiltered%5D";
        return pair;
    }
}
