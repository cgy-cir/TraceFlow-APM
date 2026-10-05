package io.traceflow.event;

import io.traceflow.event.IssueMapper.IssueRow;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IssueServiceTests {
    private final IssueMapper issueMapper = mock(IssueMapper.class);
    private final IssueStatusHistoryMapper historyMapper = mock(IssueStatusHistoryMapper.class);
    private final IssueService service = new IssueService(issueMapper, historyMapper);

    @Test
    void updatesAnAllowedStatusTransitionAndWritesHistory() {
        when(issueMapper.findById(1, 10)).thenReturn(issue("unresolved"), issue("resolved"));
        when(issueMapper.updateStatus(anyLong(), anyLong(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(), anyLong()))
                .thenReturn(1);

        service.updateStatus(1, 10, "resolved", "fixed in release");

        verify(issueMapper).updateStatus(
                org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.eq(10L),
                org.mockito.ArgumentMatchers.eq("unresolved"), org.mockito.ArgumentMatchers.eq("resolved"), anyLong());
        verify(historyMapper).insert(
                org.mockito.ArgumentMatchers.eq(10L), org.mockito.ArgumentMatchers.eq("unresolved"),
                org.mockito.ArgumentMatchers.eq("resolved"), org.mockito.ArgumentMatchers.eq("manual"),
                org.mockito.ArgumentMatchers.eq("fixed in release"), org.mockito.ArgumentMatchers.isNull(), anyLong());
    }

    @Test
    void rejectsManuallySettingRegressed() {
        when(issueMapper.findById(1, 10)).thenReturn(issue("resolved"));

        assertThatThrownBy(() -> service.updateStatus(1, 10, "regressed", null))
                .isInstanceOf(EventApiException.class)
                .hasMessageContaining("cannot move");

        verify(issueMapper, never()).updateStatus(anyLong(), anyLong(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(), anyLong());
    }

    private IssueRow issue(String status) {
        return new IssueRow(10L, 1L, "fingerprint", 2, "Title", "TypeError", status, "error",
                1L, null, null, 0, 1L, 2L, 3, 1, 100L);
    }
}
