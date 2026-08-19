package com.project.jarihana.auth.command.service.dto;

public record GithubLoginCommand(String authorizationCode, String state, String issuedState) {
}
