import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(404, "Not Found")
            return

        body = json.dumps({"status": "Connected"}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin")
        if origin in {"http://localhost:5173", "http://127.0.0.1:5173"}:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), HealthHandler)
    print("Food Rescue API listening at http://localhost:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Food Rescue API")
    finally:
        server.server_close()
