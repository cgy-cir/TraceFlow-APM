package io.traceflow.release;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class StacktraceCacheTests {
    private static StacktraceCache.Key key(long event) { return new StacktraceCache.Key(1, event, 2, "digest", 1); }
    private static StacktraceResponse response(long event) { return new StacktraceResponse(event, "v1", 2L, "resolved", 1, List.of(), List.of(), false); }

    @Test void entryCountBytesAndLeastRecentAccessAreBounded() {
        var cache = new StacktraceCache(Clock.systemUTC(), 2, 60);
        cache.put(key(1), response(1), 20);
        cache.put(key(2), response(2), 20);
        assertThat(cache.get(key(1))).isNotNull();
        cache.put(key(3), response(3), 20);
        assertThat(cache.get(key(2))).isNull();
        cache.put(key(4), response(4), 50);
        assertThat(cache.get(key(1))).isNull();
        assertThat(cache.get(key(3))).isNull();
        cache.put(key(5), response(5), 61);
        assertThat(cache.get(key(5))).isNull();
        assertThat(cache.get(key(4))).isNotNull();
        assertThat(cache.get(new StacktraceCache.Key(99, 4, 2, "digest", 1))).isNull();
    }

    @Test void resultsExpireAfterTenMinutes() {
        var time = new java.util.concurrent.atomic.AtomicLong(1);
        var clock = new Clock() {
            public ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(ZoneId zone) { return this; }
            public Instant instant() { return Instant.ofEpochMilli(time.get()); }
        };
        var cache = new StacktraceCache(clock, 2, 100);
        cache.put(key(1), response(1), 20);
        time.set(600001);
        assertThat(cache.get(key(1))).isNull();
    }
}
