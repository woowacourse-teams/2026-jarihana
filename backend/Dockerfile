FROM amazoncorretto:21 AS builder

WORKDIR /app

RUN yum install -y findutils && \
    yum clean all

COPY . .

RUN chmod +x gradlew
RUN ./gradlew clean bootJar --no-daemon


FROM amazoncorretto:21

WORKDIR /app

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
