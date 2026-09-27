package io.traceflow.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HealthControllerTests {

    @Test
    void returnsServiceHealth() {
        var response = new HealthController().health();

        assertThat(response).containsEntry("status", "UP");
        assertThat(response).containsEntry("service", "traceflow-server");
    }
}
