package io.traceflow.event;

import io.traceflow.event.EventValidationService.ErrorPayload;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ErrorFingerprintServiceTests {
    private final ErrorFingerprintService service = new ErrorFingerprintService();

    @Test
    void normalizesDynamicIdsAtTheSameCallSite() {
        var first = service.fingerprint(error(
                "Failed to load user 10001 with request 550e8400-e29b-41d4-a716-446655440000",
                "TypeError: failed\n    at loadUser (https://demo.example.com/assets/app.js:42:7)"));
        var second = service.fingerprint(error(
                "Failed to load user 10002 with request 7d444840-9dc0-11d1-b245-5ffdce74fad2",
                "TypeError: failed\n    at loadUser (https://demo.example.com/assets/app.js:42:7)"));

        assertThat(first.value()).isEqualTo(second.value());
        assertThat(first.version()).isEqualTo(2);
    }

    @Test
    void separatesTheSameMessageAtDifferentCallSites() {
        var first = service.fingerprint(error("Checkout failed",
                "Error: Checkout failed\n    at submitOrder (https://demo.example.com/src/order.ts:10:3)"));
        var second = service.fingerprint(error("Checkout failed",
                "Error: Checkout failed\n    at submitPayment (https://demo.example.com/src/payment.ts:18:5)"));

        assertThat(first.value()).isNotEqualTo(second.value());
    }

    @Test
    void fingerprintsResourceErrorsByTypeAndPath() {
        var first = service.fingerprint(new ErrorPayload("resource", "ResourceError", "failed", null,
                "https://cdn.example.com/assets/app.js?token=one", null, null, false, "script"));
        var second = service.fingerprint(new ErrorPayload("resource", "ResourceError", "failed", null,
                "https://cdn.example.com/assets/app.js?token=two", null, null, false, "script"));

        assertThat(first.value()).isEqualTo(second.value());
    }

    private ErrorPayload error(String message, String stack) {
        return new ErrorPayload("onerror", "TypeError", message, stack, null, null, null, false, null);
    }
}
