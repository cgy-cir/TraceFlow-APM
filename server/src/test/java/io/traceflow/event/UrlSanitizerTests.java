package io.traceflow.event;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UrlSanitizerTests {
    private final UrlSanitizer sanitizer = new UrlSanitizer();

    @Test
    void removesCredentialsAndFiltersSensitiveQueryValues() {
        String result = sanitizer.sanitize("https://alice:secret@example.com/orders?token=abc&tab=history&password=pwd");

        assertThat(result).doesNotContain("alice", "secret", "abc", "pwd");
        assertThat(result).contains("token=%5BFiltered%5D", "tab=history", "password=%5BFiltered%5D");
    }
}
