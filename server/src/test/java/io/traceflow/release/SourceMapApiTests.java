package io.traceflow.release;

import io.traceflow.config.SecurityConfig;
import io.traceflow.user.AccountPrincipal;
import io.traceflow.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value = SourceMapApi.class, excludeAutoConfiguration = org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration.class)
@ContextConfiguration(classes = {SourceMapApi.class, SecurityConfig.class, io.traceflow.common.ApiExceptionHandler.class})
class SourceMapApiTests {
    @Autowired MockMvc mvc;
    @MockitoBean SourceMapService maps;
    @MockitoBean UserService users;
    private final AccountPrincipal admin = new AccountPrincipal(7, "admin@example.com", "hash", "admin", "active", 0);
    @BeforeEach void setup() { when(users.sessionValid(any())).thenReturn(true); }

    @Test void membersReadMetadataButCannotUploadDeleteOrFinalize() throws Exception {
        when(maps.list(1, 2)).thenReturn(List.of());
        mvc.perform(get("/api/v1/releases/2/source-maps?applicationId=1").with(user("member").roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isArray());
        mvc.perform(multipart("/api/v1/releases/2/source-maps?applicationId=1").file(SourceMapValidatorTests.js()).file(SourceMapValidatorTests.map("{}"))
                .param("artifactPath", "/a.js").with(user("member").roles("MEMBER")).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/releases/2/source-maps/3?applicationId=1").with(user("member").roles("MEMBER")).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/releases/2/finalize?applicationId=1").with(user("member").roles("MEMBER")).with(csrf())).andExpect(status().isForbidden());
    }
    @Test void uploadsNeedBothPartsAndCsrfAndUseAuthenticatedUploader() throws Exception {
        mvc.perform(multipart("/api/v1/releases/2/source-maps?applicationId=1").file(SourceMapValidatorTests.js()).file(SourceMapValidatorTests.map("{}"))
                .param("artifactPath", "/a.js").with(user(admin))).andExpect(status().isForbidden());
        mvc.perform(multipart("/api/v1/releases/2/source-maps?applicationId=1").file(SourceMapValidatorTests.js())
                .param("artifactPath", "/a.js").with(user(admin)).with(csrf())).andExpect(status().isBadRequest());
        var summary = new SourceMapService.MapSummary(3, "/a.js", "a".repeat(64), "b".repeat(64), 1, 1, 1, 1, 7, 1791710000000L);
        when(maps.upload(eq(1L), eq(2L), eq(7L), eq("/a.js"), any(), any())).thenReturn(new SourceMapService.UploadResult(summary, true));
        mvc.perform(multipart("/api/v1/releases/2/source-maps?applicationId=1").file(SourceMapValidatorTests.js()).file(SourceMapValidatorTests.map("{}"))
                .param("artifactPath", "/a.js").with(user(admin)).with(csrf()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.uploadedAt").value(1791710000000L)).andExpect(jsonPath("$.mapContent").doesNotExist());
    }
}
