package com.project.jarihana.support;

import java.sql.SQLException;
import java.util.Map;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

public final class WorkerPostgres {
    private WorkerPostgres() {}

    // Gradle 워커 JVM마다 최초 DB 접근 시 한 번만 시작한다. JVM 종료 시 Testcontainers가 정리한다.
    private static class Server {
        static final PostgreSQLContainer INSTANCE = new PostgreSQLContainer("postgres:17")
                .withDatabaseName("jarihana_test")
                .withTmpFs(Map.of("/var/lib/postgresql/data", "rw"));
        static {
            INSTANCE.start();
        }
    }

    static PostgreSQLContainer container() {
        return Server.INSTANCE;
    }

    public static Database createDatabase(String name) throws SQLException {
        var server = container();
        var dataSource = new PGSimpleDataSource();
        dataSource.setURL(server.getJdbcUrl());
        dataSource.setDatabaseName(name);
        dataSource.setUser(server.getUsername());
        dataSource.setPassword(server.getPassword());
        try (var admin = server.createConnection(""); var statement = admin.createStatement()) {
            statement.execute("CREATE DATABASE " + statement.enquoteIdentifier(name, true));
        }
        return new Database(name, server, dataSource);
    }

    public record Database(String name, PostgreSQLContainer container, PGSimpleDataSource dataSource)
            implements AutoCloseable {
        @Override
        public void close() throws SQLException {
            try (var admin = container.createConnection(""); var statement = admin.createStatement()) {
                statement.execute("DROP DATABASE " + statement.enquoteIdentifier(name, true));
            }
        }
    }
}
