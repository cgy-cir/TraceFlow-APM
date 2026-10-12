package io.traceflow.release;

import java.util.List;

public record StacktraceResponse(long eventId, String releaseName, Long releaseId, String status, int parserVersion,
                                 List<Frame> frames, List<Diagnostic> diagnostics, boolean truncated) {
    public record Generated(String functionName, String filename, Integer line, Integer column) { }
    public record Original(String functionName, String filename, int line, int column,
                           List<ContextLine> context, String contextReason) { }
    public record ContextLine(int line, String content, boolean isErrorLine) { }
    public record Frame(int index, String raw, String status, String reason, Generated generated, Original original) { }
    public record Diagnostic(String code, String message) { }
}
