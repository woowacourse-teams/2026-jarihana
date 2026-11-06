package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuChatRoom;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GomokuChatRoomRepository extends JpaRepository<GomokuChatRoom, Long> {}
