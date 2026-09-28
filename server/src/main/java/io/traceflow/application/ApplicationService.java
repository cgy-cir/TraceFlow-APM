package io.traceflow.application;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import io.traceflow.application.ApplicationApi.ApplicationResponse;
import io.traceflow.application.ApplicationApi.CreateApplicationRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class ApplicationService {
    public static final String DEMO_APP_KEY = "tf_app_demo_web";

    private final ApplicationMapper applicationMapper;
    private final ObjectMapper objectMapper;

    public ApplicationService(ApplicationMapper applicationMapper, ObjectMapper objectMapper) {
        this.applicationMapper = applicationMapper;
        this.objectMapper = objectMapper;
    }

    public List<ApplicationResponse> list() {
        return applicationMapper.selectList(new LambdaQueryWrapper<ApplicationEntity>()
                        .orderByAsc(ApplicationEntity::getName))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ApplicationResponse create(CreateApplicationRequest request) {
        ApplicationEntity entity = new ApplicationEntity();
        entity.setName(request.name().trim());
        entity.setAppKey("tf_app_" + UUID.randomUUID().toString().replace("-", ""));
        entity.setPlatform("web");
        entity.setAllowedOrigins(objectMapper.writeValueAsString(request.allowedOrigins()));
        entity.setRetentionDays(request.retentionDays() == null ? 30 : request.retentionDays());
        entity.setStatus("active");
        entity.setCreatedBy(DevDataInitializer.DEV_USER_ID);
        long now = System.currentTimeMillis();
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        applicationMapper.insert(entity);
        return toResponse(applicationMapper.selectById(entity.getId()));
    }

    public ApplicationEntity findActiveByAppKey(String appKey) {
        return applicationMapper.selectOne(new LambdaQueryWrapper<ApplicationEntity>()
                .eq(ApplicationEntity::getAppKey, appKey)
                .eq(ApplicationEntity::getStatus, "active"));
    }

    private ApplicationResponse toResponse(ApplicationEntity entity) {
        List<String> origins = new ArrayList<>();
        JsonNode node = objectMapper.readTree(entity.getAllowedOrigins());
        if (node != null && node.isArray()) {
            node.forEach(item -> origins.add(item.asText()));
        }
        return new ApplicationResponse(entity.getId(), entity.getName(), entity.getAppKey(), entity.getPlatform(),
                origins, entity.getRetentionDays(), entity.getStatus(), entity.getCreatedAt());
    }
}
