package com.project.rehearsal;

import com.project.jarihana.JarihanaApplication;
import com.project.jarihana.common.deployment.ApplicationActivity;
import com.project.jarihana.notificationdelivery.client.PushTransport;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.control.WorkerAdmissionController;
import com.project.jarihana.pushsubscription.config.PushProperties;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.SpringApplication;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

public class WorkerFinishRehearsal {
    public static String requireIsolatedDatabase(String url) {
        var pattern = Pattern.compile("^jdbc:postgresql://jarihana-db\\.cqsc6pyqhwww\\.ap-northeast-2\\.rds\\.amazonaws\\.com:5432/"
                + "jarihana_dev\\?sslmode=require&currentSchema=(bg_[0-9a-f]{32})$");
        var match = pattern.matcher(url);
        if (!match.matches()) {
            throw new IllegalArgumentException("시험은 지정한 개발 DB의 고유 스키마에서만 실행합니다.");
        }
        return match.group(1);
    }

    public static void main(String[] args) throws Exception {
        requireIsolatedDatabase(System.getenv("DB_URL"));
        if (!"false".equals(System.getenv("PUSH_ENABLED"))
                || !"false".equals(System.getenv("PUSH_WORKER_ENABLED")) || args.length != 0) {
            throw new IllegalArgumentException("시험은 외부 푸시와 스케줄러가 꺼진 고정 설정에서만 실행합니다.");
        }
        Path mailbox = Files.createDirectory(Path.of("/tmp/worker-finish-rehearsal"),
                PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        try (var context = SpringApplication.run(JarihanaApplication.class)) {
            var properties = context.getBean(PushProperties.class);
            if (properties.enabled() || properties.workerEnabled()) {
                throw new IllegalStateException("애플리케이션의 실제 푸시가 활성화되어 있습니다.");
            }
            var fixtureProperties = new PushProperties(true, false, "fixture", "fixture", "mailto:fixture@example.invalid",
                    null, 1, Duration.ofMinutes(5), Duration.ofSeconds(10), Duration.ofSeconds(5), Duration.ofSeconds(5));
            var calls = new AtomicInteger();
            PushTransport receiver = request -> {
                if (!request.endpoint().startsWith("https://push.rehearsal.invalid/")) {
                    throw new IllegalStateException("시험 수신자가 아닌 푸시 대상입니다.");
                }
                try {
                    Files.writeString(mailbox.resolve("received.json"), "{\"count\":" + calls.incrementAndGet()
                            + ",\"delivery_id\":" + request.deliveryId() + "}");
                } catch (IOException exception) {
                    throw new IllegalStateException("시험 수신 기록을 저장하지 못했습니다.", exception);
                }
                return PushResult.accepted();
            };
            var worker = new PushDeliveryWorker(context.getBean(PushDeliveryLeaseService.class), receiver,
                    fixtureProperties, context.getBean(WorkerAdmissionController.class), context.getBean(MeterRegistry.class));
            var activity = context.getBean(ApplicationActivity.class);
            Files.writeString(mailbox.resolve("ready"), "ready");
            while (!Thread.currentThread().isInterrupted()) {
                if (Files.deleteIfExists(mailbox.resolve("run"))) {
                    try (var running = activity.beginBackground()) {
                        int processed = worker.processDue();
                        Files.writeString(mailbox.resolve("result.json"), "{\"processed\":" + processed
                                + ",\"received\":" + calls.get() + "}");
                    }
                }
                Thread.sleep(50);
            }
        }
    }
}
