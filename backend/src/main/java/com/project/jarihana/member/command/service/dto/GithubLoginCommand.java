package com.project.jarihana.member.command.service.dto;

public record GithubLoginCommand(String authorizationCode, String state, String issuedState) {
}
