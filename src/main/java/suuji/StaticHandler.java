package suuji;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;

/** Serves the single-page frontend from the classpath (src/main/resources/web). */
public final class StaticHandler implements HttpHandler {
    private static final Map<String, String> TYPES = Map.of(
            "html", "text/html; charset=utf-8",
            "js", "application/javascript; charset=utf-8",
            "css", "text/css; charset=utf-8",
            "json", "application/json; charset=utf-8",
            "svg", "image/svg+xml",
            "png", "image/png",
            "ico", "image/x-icon",
            "woff2", "font/woff2");

    private final String base;

    public StaticHandler(String base) {
        this.base = base;
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..") || path.contains("//")) {
            notFound(ex);
            return;
        }
        try (InputStream in = StaticHandler.class.getResourceAsStream(base + path)) {
            if (in == null) {
                notFound(ex);
                return;
            }
            byte[] body = in.readAllBytes();
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            ex.getResponseHeaders().set("Content-Type", TYPES.getOrDefault(ext, "application/octet-stream"));
            ex.getResponseHeaders().set("Cache-Control", "no-cache");
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        }
    }

    private static void notFound(HttpExchange ex) throws IOException {
        byte[] body = "404 Not Found".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        ex.sendResponseHeaders(404, body.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(body);
        }
    }
}
