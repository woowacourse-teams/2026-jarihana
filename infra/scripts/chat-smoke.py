#!/usr/bin/env python3
import base64
import hashlib
from http.cookies import SimpleCookie
import json
import os
import socket
import ssl
import struct
import sys
import urllib.parse
import urllib.request


def exact(stream, count):
    data = stream.read(count)
    if len(data) != count:
        raise RuntimeError("WebSocket closed during smoke")
    return data


def send(sock, payload, opcode=1):
    data = payload.encode() if isinstance(payload, str) else payload
    mask = os.urandom(4)
    length = len(data)
    header = bytes([128 | opcode, 128 | length]) if length < 126 else bytes([128 | opcode, 254]) + struct.pack("!H", length)
    sock.sendall(header + mask + bytes(value ^ mask[i % 4] for i, value in enumerate(data)))


def receive(stream, sock):
    message = b""
    while True:
        first, second = exact(stream, 2)
        opcode = first & 15
        length = second & 127
        if length == 126:
            length = struct.unpack("!H", exact(stream, 2))[0]
        elif length == 127:
            length = struct.unpack("!Q", exact(stream, 8))[0]
        if second & 128 or length > 65536 or len(message) + length > 65536:
            raise RuntimeError("invalid/oversized server frame")
        data = exact(stream, length)
        if opcode == 8:
            raise RuntimeError("WebSocket rejected/closed")
        if opcode == 9:
            send(sock, data, 10)
            continue
        if opcode == 10:
            continue
        if opcode not in (0, 1):
            raise RuntimeError("unexpected WebSocket opcode")
        message += data
        if first & 128:
            text = message.decode()
            if text.strip():
                return text
            message = b""


def main():
    base = sys.argv[1].rstrip("/")
    url = urllib.parse.urlsplit(base)
    token = os.environ["CHAT_SMOKE_ACCESS_TOKEN"]
    origin = os.environ["CHAT_SMOKE_ORIGIN"]
    group = os.environ["CHAT_SMOKE_GROUP_ID"]
    if not group.isdecimal() or any(c in token + origin for c in "\r\n") or ";" in token:
        raise RuntimeError("invalid smoke inputs")
    cookie = "accessToken=" + token

    def get(path):
        request = urllib.request.Request(base + path, headers={"Cookie": cookie, "Origin": origin})
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.load(response)
            if body.get("success") is not True:
                raise RuntimeError("authenticated API smoke failed")
            return body, response.headers

    _, headers = get("/api/chats?size=1")
    cookies = SimpleCookie()
    for value in headers.get_all("Set-Cookie", []):
        cookies.load(value)
    csrf = cookies["XSRF-TOKEN"].value
    cookie += "; XSRF-TOKEN=" + csrf
    sock = socket.create_connection((url.hostname, url.port or (443 if url.scheme == "https" else 80)), timeout=10)
    if url.scheme == "https":
        sock = ssl.create_default_context().wrap_socket(sock, server_hostname=url.hostname)
    with sock:
        key = base64.b64encode(os.urandom(16)).decode()
        request = (f"GET /api/ws/chat HTTP/1.1\r\nHost: {url.netloc}\r\nUpgrade: websocket\r\n"
                   f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
                   f"Sec-WebSocket-Protocol: v12.stomp\r\nOrigin: {origin}\r\nCookie: {cookie}\r\n\r\n")
        sock.sendall(request.encode())
        with sock.makefile("rb") as stream:
            if b" 101 " not in stream.readline(8192):
                raise RuntimeError("authenticated WebSocket upgrade failed")
            response_headers = {}
            for _ in range(100):
                line = stream.readline(8192)
                if line == b"\r\n":
                    break
                key_name, value = line.decode().split(":", 1)
                response_headers[key_name.lower()] = value.strip()
            expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
            if response_headers.get("sec-websocket-accept") != expected:
                raise RuntimeError("invalid WebSocket handshake accept")
            send(sock, "CONNECT\naccept-version:1.2\nheart-beat:0,0\nX-XSRF-TOKEN:" + csrf + "\n\n\0")
            if not receive(stream, sock).lstrip().startswith("CONNECTED\n"):
                raise RuntimeError("STOMP CONNECT rejected")
            send(sock, "SUBSCRIBE\nid:deployment-smoke\ndestination:/user/queue/chat-events\nack:auto\n\n\0")
            body, _ = get(f"/api/groups/{group}/chat/messages?afterSequence=0&size=1")
            if not isinstance(body.get("data", {}).get("items"), list):
                raise RuntimeError("catch-up response invalid")
            sock.settimeout(1)
            try:
                if "ERROR" in receive(stream, sock):
                    raise RuntimeError("STOMP subscription rejected")
            except socket.timeout:
                pass
            send(sock, struct.pack("!H", 1000), 8)
    print("Authenticated HTTP, STOMP CONNECT, subscription send and catch-up smoke passed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Chat smoke failed: {type(error).__name__}", file=sys.stderr)
        sys.exit(1)
