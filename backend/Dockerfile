# jar는 이미지 안에서 빌드하지 않는다. 먼저 ./gradlew bootJar로 build/libs에 만든 jar를 복사한다.
# jar 하나를 통째로 복사하면 코드만 바뀌어도 의존성까지 담긴 레이어 전체가 새로 올라간다.
# 그래서 jar를 계층별로 풀어 자주 바뀌지 않는 의존성 레이어를 앞에 두고 애플리케이션 레이어만 새로 만든다.
FROM amazoncorretto:21 AS extractor

WORKDIR /extract

COPY build/libs/*.jar app.jar

RUN java -Djarmode=tools -jar app.jar extract --layers --destination extracted

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

# 바뀌는 빈도가 낮은 계층부터 복사한다. 내용이 같은 계층은 직전 이미지와 digest가 같아 push와 pull을 건너뛴다.
COPY --from=extractor --chown=app:app /extract/extracted/dependencies/ ./
COPY --from=extractor --chown=app:app /extract/extracted/spring-boot-loader/ ./
COPY --from=extractor --chown=app:app /extract/extracted/snapshot-dependencies/ ./
COPY --from=extractor --chown=app:app /extract/extracted/application/ ./

USER app

EXPOSE 8080

# 풀어낸 app.jar는 manifest의 Class-Path로 lib/의 의존성을 읽는다.
ENTRYPOINT ["java", "-jar", "app.jar"]
