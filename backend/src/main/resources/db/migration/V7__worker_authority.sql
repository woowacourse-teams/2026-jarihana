CREATE TABLE worker_authority (
    environment varchar(64) PRIMARY KEY,
    deployment_id uuid,
    epoch bigint NOT NULL DEFAULT 0 CHECK (epoch >= 0),
    phase varchar(32) NOT NULL DEFAULT 'IDLE'
        CHECK (phase IN ('IDLE', 'PREPARE', 'HANDOFF', 'OBSERVE', 'COMPLETE', 'NEEDS_ATTENTION')),
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    authority_revision bigint NOT NULL DEFAULT 0 CHECK (authority_revision >= 0),
    owner_host varchar(64),
    owner_boot_id uuid,
    status varchar(16) NOT NULL DEFAULT 'UNASSIGNED'
        CHECK (status IN ('UNASSIGNED', 'ACTIVE', 'DRAINING')),
    last_command_id uuid,
    last_command_payload text,
    CHECK ((status = 'UNASSIGNED' AND owner_host IS NULL AND owner_boot_id IS NULL)
        OR (status IN ('ACTIVE', 'DRAINING') AND owner_host IS NOT NULL AND owner_boot_id IS NOT NULL)),
    CHECK ((epoch = 0 AND deployment_id IS NULL AND phase = 'IDLE')
        OR (epoch > 0 AND deployment_id IS NOT NULL AND phase <> 'IDLE'))
);
