FROM amazoncorretto:21 AS builder

WORKDIR /app

RUN yum install -y findutils && \
    yum clean all

COPY . .

RUN chmod +x gradlew
RUN ./gradlew clean bootJar --no-daemon


FROM amazoncorretto:21

WORKDIR /app

# BuildKit에 따라 ADD --chmod가 새로 만든 상위 디렉터리에도 0644를 적용해 app 사용자가 agent를 열지 못한다.
# 디렉터리를 먼저 만들어 0755를 유지한다.
RUN mkdir -p /opt/opentelemetry

ADD --chmod=0644 --checksum=sha256:f787eb6c7f3d18e69a431e108a15278d25ee37f83d68b678f621e063f3988f82 \
    https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.32.0/opentelemetry-javaagent.jar \
    /opt/opentelemetry/opentelemetry-javaagent.jar

ENV JAVA_TOOL_OPTIONS="-javaagent:/opt/opentelemetry/opentelemetry-javaagent.jar"

RUN yum install -y shadow-utils && \
    yum clean all

RUN useradd --system \
    --no-create-home \
    --shell /usr/sbin/nologin \
    app

COPY --from=builder \
    --chown=app:app \
    /app/build/libs/*.jar \
    app.jar

USER app

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
