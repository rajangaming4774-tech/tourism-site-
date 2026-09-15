"""Static file server for the heritage map.

Reads the port from the PORT environment variable so the harness can assign a
free port (autoPort) instead of colliding on a hard-coded one.

Binds dual-stack (IPv6 + IPv4-mapped) because browsers resolve "localhost" to
::1 on Windows; an IPv4-only bind leaves subresource requests unanswered.
"""
import functools
import http.server
import os
import pathlib
import re
import socket
import socketserver

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "5500"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Data files change often during development; never serve them stale.
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    # SimpleHTTPRequestHandler has no Range support, so a <video> can never
    # seek locally — Chromium reports an empty seekable range without a 206
    # response, even once the file is fully buffered. Scroll-scrubbed video
    # (mahabalipuram.html) needs real seeking to test, so serve single-range
    # byte requests ourselves; anything else falls back to the normal path.
    def send_head(self):
        self._range = None
        range_header = self.headers.get("Range")
        if not range_header:
            return super().send_head()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()

        match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
        if not match or match.group(1) == match.group(2) == "":
            return super().send_head()

        f = open(path, "rb")
        file_len = os.fstat(f.fileno()).st_size
        start_s, end_s = match.groups()
        if start_s == "":
            start = max(0, file_len - int(end_s))
            end = file_len - 1
        else:
            start = int(start_s)
            end = min(int(end_s), file_len - 1) if end_s else file_len - 1

        if start > end or start >= file_len:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{file_len}")
            self.end_headers()
            return None

        self.send_response(206)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_len}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        f.seek(start)
        self._range = (start, end)
        return f

    def copyfile(self, source, outputfile):
        if self._range is None:
            return super().copyfile(source, outputfile)
        remaining = self._range[1] - self._range[0] + 1
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True
    address_family = socket.AF_INET6

    def server_bind(self):
        # Accept IPv4 clients on the same socket (127.0.0.1 as well as ::1).
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except OSError:
            pass
        super().server_bind()


handler = functools.partial(Handler, directory=str(ROOT))
try:
    httpd = Server(("::", PORT), handler)
except OSError:
    # No IPv6 on this machine — fall back to every IPv4 interface.
    Server.address_family = socket.AF_INET
    httpd = Server(("", PORT), handler)

print(f"Serving {ROOT} at http://localhost:{PORT}/", flush=True)
httpd.serve_forever()
