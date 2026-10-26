package com.project.jarihana.notificationdelivery.command.repository;

import com.project.jarihana.notificationdelivery.domain.DeploymentPhase;
import com.project.jarihana.notificationdelivery.domain.WorkerAuthority;
import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class WorkerAuthorityRepository {
    private final JdbcTemplate jdbc;

    @Transactional(propagation = Propagation.MANDATORY)
    public void initialize(String environment) {
        jdbc.update("insert into worker_authority(environment) values (?) on conflict (environment) do nothing", environment);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<WorkerAuthority> lock(String environment) {
        return jdbc.query("select * from worker_authority where environment = ? for update", this::map, environment)
                .stream().findFirst();
    }

    public Optional<WorkerAuthority> find(String environment) {
        return jdbc.query("select * from worker_authority where environment = ?", this::map, environment)
                .stream().findFirst();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void save(WorkerAuthority authority) {
        var owner = authority.owner();
        int updated = jdbc.update("""
                update worker_authority set deployment_id = ?, epoch = ?, phase = ?, revision = ?,
                    authority_revision = ?, owner_host = ?, owner_boot_id = ?, status = ?,
                    last_command_id = ?, last_command_payload = ? where environment = ?
                """, authority.deploymentId(), authority.epoch(), authority.phase().name(), authority.revision(),
                authority.authorityRevision(), owner == null ? null : owner.hostId(), owner == null ? null : owner.bootId(),
                authority.status().name(), authority.lastCommandId(), authority.lastCommandPayload(), authority.environment());
        if (updated != 1) { throw new IllegalStateException("worker 권한 행이 없습니다."); }
    }

    private WorkerAuthority map(ResultSet row, int index) throws SQLException {
        String host = row.getString("owner_host");
        WorkerIdentity owner = host == null ? null : new WorkerIdentity(host, row.getObject("owner_boot_id", UUID.class));
        return new WorkerAuthority(row.getString("environment"), row.getObject("deployment_id", UUID.class),
                row.getLong("epoch"), DeploymentPhase.valueOf(row.getString("phase")), row.getLong("revision"),
                row.getLong("authority_revision"), owner, WorkerAuthority.Status.valueOf(row.getString("status")),
                row.getObject("last_command_id", UUID.class), row.getString("last_command_payload"));
    }
}
