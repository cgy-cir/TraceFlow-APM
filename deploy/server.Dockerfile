ARG BASE_IMAGE=eclipse-temurin:21-jre-alpine
FROM ${BASE_IMAGE}
RUN addgroup -S traceflow && adduser -S -G traceflow -u 10001 traceflow
WORKDIR /app
COPY --chown=traceflow:traceflow server/target/traceflow-server-*.jar /app/server.jar
USER traceflow
EXPOSE 18080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:18080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/server.jar"]
