package io.traceflow.release;

import io.traceflow.config.SecurityConfig;
import io.traceflow.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value = StacktraceApi.class, excludeAutoConfiguration = org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration.class)
@ContextConfiguration(classes = {StacktraceApi.class, SecurityConfig.class, io.traceflow.common.ApiExceptionHandler.class})
class StacktraceApiTests {
    @Autowired MockMvc mvc;
    @MockitoBean StacktraceService stacktraces;
    @MockitoBean UserService users;

    @Test void authenticationAndPrivateResponseCachingAreEnforced() throws Exception {
        mvc.perform(get("/api/v1/events/7/stacktrace?applicationId=1")).andExpect(status().isUnauthorized());
        when(stacktraces.get(1, 7)).thenReturn(new StacktraceResponse(7, "v1", null, "unresolved", 1, List.of(), List.of(), false));
        mvc.perform(get("/api/v1/events/7/stacktrace?applicationId=1").with(user("member").roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "private, no-store"));
        verify(stacktraces).get(1, 7);
    }
}
