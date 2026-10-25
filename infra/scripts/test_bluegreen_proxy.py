import base64
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request


SPEC = importlib.util.spec_from_file_location("deployment", Path(__file__).with_name("deploy-bluegreen.py"))
deployment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deployment)

SERVER = '''
import base64,hashlib,http.server,threading,time
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        color=self.server.color.encode()
        if self.headers.get("Upgrade", "").lower()=="websocket":
            accept=base64.b64encode(hashlib.sha1((self.headers['Sec-WebSocket-Key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            self.send_response(101)
            self.send_header('Upgrade','websocket')
            self.send_header('Connection','Upgrade')
            self.send_header('Sec-WebSocket-Accept',accept)
            self.end_headers()
            for _ in range(30):
                self.wfile.write(bytes([129,len(color)])+color)
                self.wfile.flush()
                time.sleep(.2)
        else:
            self.send_response(200)
            self.send_header('Content-Length',str(len(color)))
            self.end_headers()
            self.wfile.write(color)
for color,port in [('blue',18080),('green',28080)]:
    server=http.server.ThreadingHTTPServer(('0.0.0.0',port),Handler)
    server.color=color
    threading.Thread(target=server.serve_forever,daemon=True).start()
threading.Event().wait()
'''


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True, stderr=subprocess.STDOUT).strip()


def main():
    owned = []
    with tempfile.TemporaryDirectory(prefix="jarihana-proxy-test-") as temporary:
        directory = Path(temporary)
        (directory / "server.py").write_text(SERVER)
        deployment.atomic_write(directory / "nginx.conf", deployment.nginx_config("blue"))
        try:
            server = docker("run", "-d", "--rm", "-p", "127.0.0.1::8080", "-v", f"{directory}:/fixture:ro",
                            "python:3.13-alpine", "python", "/fixture/server.py")
            owned.append(server)
            proxy = docker("run", "-d", "--rm", "--network", "container:" + server,
                           "-v", f"{directory}:/etc/nginx:ro", "nginx:1.30.5-alpine")
            owned.append(proxy)
            port = int(docker("port", server, "8080/tcp").split(":")[-1])
            base = f"http://127.0.0.1:{port}"
            def get_color():
                with urllib.request.urlopen(base + "/api/groups", timeout=3) as response:
                    color = response.read().decode()
                    assert response.headers["X-Jarihana-Color"] == color
                    return color
            def wait_color(expected):
                for _ in range(30):
                    try:
                        if get_color() == expected:
                            return
                    except OSError:
                        pass
                    time.sleep(.2)
                raise AssertionError("proxy failed to route " + expected)
            wait_color("blue")
            with socket.create_connection(("127.0.0.1", port), timeout=3) as ws:
                key = base64.b64encode(b"1234567890123456").decode()
                ws.sendall((f"GET /api/ws/chat HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n"
                            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
                with ws.makefile("rb") as stream:
                    assert b" 101 " in stream.readline()
                    while stream.readline() != b"\r\n":
                        pass
                    assert stream.read(6) == b"\x81\x04blue"
                    deployment.atomic_write(directory / "nginx.conf", deployment.nginx_config("green"))
                    docker("exec", proxy, "nginx", "-t")
                    docker("exec", proxy, "nginx", "-s", "reload")
                    wait_color("green")
                    with socket.create_connection(("127.0.0.1", port), timeout=3) as new_ws:
                        new_ws.sendall((f"GET /api/ws/chat HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n"
                                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
                        with new_ws.makefile("rb") as new_stream:
                            assert b" 101 " in new_stream.readline()
                            while new_stream.readline() != b"\r\n":
                                pass
                            assert new_stream.read(7) == b"\x81\x05green"
                    for _ in range(15):
                        assert stream.read(6) == b"\x81\x04blue"
                    deployment.atomic_write(directory / "nginx.conf", deployment.nginx_config("blue"))
                    docker("exec", proxy, "nginx", "-t")
                    docker("exec", proxy, "nginx", "-s", "reload")
                    wait_color("blue")
            print(json.dumps({"http_blue_to_green": "PASS", "websocket_upgrade": "PASS",
                              "new_socket_green": "PASS", "existing_socket_retained": "PASS", "rollback_to_blue": "PASS"}))
        finally:
            for container in reversed(owned):
                docker("rm", "-f", container)


if __name__ == "__main__":
    main()
