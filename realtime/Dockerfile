FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY realtime/gradlew realtime/settings.gradle realtime/build.gradle ./realtime/
COPY realtime/gradle ./realtime/gradle
COPY realtime/src ./realtime/src
COPY contracts/realtime/v1 ./contracts/realtime/v1
WORKDIR /workspace/realtime
RUN chmod +x gradlew && ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system realtime && useradd --system --gid realtime realtime
COPY --from=build /workspace/realtime/build/libs/*.jar /app/server.jar
USER realtime
ENV PORT=8080
EXPOSE 8080 8081
ENTRYPOINT ["java", "-jar", "/app/server.jar"]
