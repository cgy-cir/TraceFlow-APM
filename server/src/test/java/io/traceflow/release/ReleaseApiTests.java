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

@WebMvcTest(value = ReleaseApi.class, excludeAutoConfiguration = org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration.class)
@ContextConfiguration(classes = {ReleaseApi.class, SecurityConfig.class, io.traceflow.common.ApiExceptionHandler.class})
class ReleaseApiTests {
    @Autowired MockMvc mvc;
    @MockitoBean ReleaseService releases;
    @MockitoBean UserService users;
    private final AccountPrincipal admin = new AccountPrincipal(7, "admin@example.com", "hash", "admin", "active", 0);
    private static final String BODY = """
            {"applicationId":1,"releaseName":"demo@1","artifacts":[{"artifactPath":"/a.js","jsSha256":"%s","mapSha256":"%s"}]}
            """.formatted("a".repeat(64), "b".repeat(64));

    @BeforeEach void setup() { when(users.sessionValid(any())).thenReturn(true); }

    @Test void anonymousRequiresLoginAndMembersCanRead() throws Exception {
        mvc.perform(get("/api/v1/releases").param("applicationId", "1")).andExpect(status().isUnauthorized());
        when(releases.list(1, null, null, 1, 20)).thenReturn(new ReleaseService.ReleaseList(List.of(), 0, 1, 20));
        mvc.perform(get("/api/v1/releases").param("applicationId", "1").with(user("member").roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test void membersCannotCreateAndAdminNeedsCsrf() throws Exception {
        mvc.perform(post("/api/v1/releases").with(user("member").roles("MEMBER")).with(csrf()).contentType("application/json").content(BODY))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/releases").with(user(admin)).contentType("application/json").content(BODY))
                .andExpect(status().isForbidden());
        verifyNoInteractions(releases);
    }

    @Test void creationUsesAuthenticatedCreatorAndReturnsEpochTime() throws Exception {
        var summary = new ReleaseService.ReleaseSummary(9, 1, "demo@1", null, "draft", 1, 0, 0, 7, 1791710000000L, null, null);
        when(releases.create(any(), eq(7L))).thenReturn(new ReleaseService.CreateResult(new ReleaseService.ReleaseDetail(summary, List.of()), true));
        mvc.perform(post("/api/v1/releases").with(user(admin)).with(csrf()).contentType("application/json").content(BODY))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.release.createdAt").value(1791710000000L))
                .andExpect(jsonPath("$.release.createdBy").value(7));
        when(releases.create(any(), eq(7L))).thenReturn(new ReleaseService.CreateResult(new ReleaseService.ReleaseDetail(summary, List.of()), false));
        mvc.perform(post("/api/v1/releases").with(user(admin)).with(csrf()).contentType("application/json").content(BODY)).andExpect(status().isOk());
    }

    @Test void invalidNestedManifestAndPaginationAreRejected() throws Exception {
        mvc.perform(post("/api/v1/releases").with(user(admin)).with(csrf()).contentType("application/json").content(BODY.replace("a".repeat(64), "invalid")))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/releases").with(user(admin)).param("applicationId", "1").param("page", "0"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(releases);
    }

    @Test void deploymentRequiresAdminCsrfAndValidEpochBody() throws Exception {
        String route = "/api/v1/releases/9/deployment?applicationId=1";
        mvc.perform(patch(route).with(user("member").roles("MEMBER")).with(csrf()).contentType("application/json").content("{\"deployedAt\":1791710000000}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch(route).with(user(admin)).contentType("application/json").content("{\"deployedAt\":1791710000000}"))
                .andExpect(status().isForbidden());
        for (String body : List.of("{}", "{\"deployedAt\":null}", "{\"deployedAt\":0}", "{\"deployedAt\":-1}"))
            mvc.perform(patch(route).with(user(admin)).with(csrf()).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        verifyNoInteractions(releases);
    }

    @Test void deploymentReturnsMillisecondsAndUsesScopedIdentity() throws Exception {
        long timestamp = 1791710000000L;
        var summary = new ReleaseService.ReleaseSummary(9, 1, "demo@1", null, "finalized", 1, 1, 100, 7, timestamp - 2, timestamp - 1, timestamp);
        when(releases.registerDeployment(1, 9, timestamp)).thenReturn(new ReleaseService.ReleaseDetail(summary, List.of()));
        mvc.perform(patch("/api/v1/releases/9/deployment?applicationId=1").with(user(admin)).with(csrf())
                .contentType("application/json").content("{\"deployedAt\":" + timestamp + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.release.deployedAt").value(timestamp));
        when(releases.registerDeployment(2, 9, timestamp)).thenThrow(new io.traceflow.event.EventApiException(404, "RELEASE_NOT_FOUND", "not found"));
        mvc.perform(patch("/api/v1/releases/9/deployment?applicationId=2").with(user(admin)).with(csrf())
                .contentType("application/json").content("{\"deployedAt\":" + timestamp + "}"))
                .andExpect(status().isNotFound());
    }

    @Test void detailKeepsApplicationScope() throws Exception {
        when(releases.get(2, 9)).thenThrow(new io.traceflow.event.EventApiException(404, "RELEASE_NOT_FOUND", "not found"));
        mvc.perform(get("/api/v1/releases/9").with(user("member").roles("MEMBER")).param("applicationId", "2"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RELEASE_NOT_FOUND"));
    }
}
