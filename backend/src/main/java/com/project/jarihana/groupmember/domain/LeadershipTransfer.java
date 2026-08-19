package com.project.jarihana.groupmember.domain;

public final class LeadershipTransfer {

    private final GroupMember formerLeader;
    private final GroupMember newLeader;

    private LeadershipTransfer(GroupMember formerLeader, GroupMember newLeader) {
        this.formerLeader = formerLeader;
        this.newLeader = newLeader;
    }

    static LeadershipTransfer of(GroupMember formerLeader, GroupMember newLeader) {
        return new LeadershipTransfer(formerLeader, newLeader);
    }

    public GroupMember getFormerLeader() {
        return formerLeader;
    }

    public GroupMember getNewLeader() {
        return newLeader;
    }
}
