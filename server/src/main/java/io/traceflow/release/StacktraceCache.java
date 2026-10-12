package io.traceflow.release;

import java.time.Clock;
import java.util.LinkedHashMap;

final class StacktraceCache {
    private final LinkedHashMap<Key, Entry> entries = new LinkedHashMap<>(16, 0.75f, true);
    private final Clock clock;
    private final int capacity;
    private final long maxBytes;
    private long bytes;
    StacktraceCache() { this(Clock.systemUTC(), 500, 32L * 1024 * 1024); }
    StacktraceCache(Clock clock, int capacity, long maxBytes) { this.clock = clock; this.capacity = capacity; this.maxBytes = maxBytes; }

    synchronized StacktraceResponse get(Key key) {
        var iterator = entries.values().iterator();
        while (iterator.hasNext()) {
            var entry = iterator.next();
            if (clock.millis() - entry.createdAt() >= 600000) { bytes -= entry.bytes(); iterator.remove(); }
        }
        var entry = entries.get(key);
        return entry == null ? null : entry.response();
    }
    synchronized void put(Key key, StacktraceResponse response, int size) {
        if (size > maxBytes) return;
        var previous = entries.remove(key);
        if (previous != null) bytes -= previous.bytes();
        while (!entries.isEmpty() && (entries.size() >= capacity || bytes + size > maxBytes)) {
            var oldest = entries.entrySet().iterator();
            bytes -= oldest.next().getValue().bytes(); oldest.remove();
        }
        entries.put(key, new Entry(response, size, clock.millis()));
        bytes += size;
    }
    record Key(long applicationId, long eventId, long releaseId, String manifestDigest, int parserVersion) { }
    private record Entry(StacktraceResponse response, int bytes, long createdAt) { }
}
