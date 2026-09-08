package suuji;

import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Path;
import java.util.concurrent.Executors;

/**
 * Nihongo Suuji Trainer - a dependency-free Java web app for studying Japanese numbers,
 * counters (助数詞), dates, times and ages.
 *
 * Usage: java suuji.Main [--port 8080] [--data ./data] [--no-browser]
 */
public final class Main {
    public static void main(String[] args) throws Exception {
        int port = 8080;
        Path dataDir = Path.of("data");
        boolean openBrowser = true;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--port", "-p" -> port = Integer.parseInt(args[++i]);
                case "--data", "-d" -> dataDir = Path.of(args[++i]);
                case "--no-browser" -> openBrowser = false;
                case "--help", "-h" -> {
                    System.out.println("Usage: java suuji.Main [--port 8080] [--data ./data] [--no-browser]");
                    return;
                }
                default -> throw new IllegalArgumentException("unknown option: " + args[i]);
            }
        }

        ItemRepository repo = ItemRepository.loadDefault();
        ProgressStore store = new ProgressStore(dataDir.resolve("progress.tsv"));

        fixWindowsLoopbackTempDir();
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/", new Api(repo, store));
        server.createContext("/", new StaticHandler("/web"));
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        String url = "http://localhost:" + port + "/";
        System.out.println("Nihongo Suuji Trainer: " + repo.all().size() + " items loaded");
        System.out.println("Progress file: " + dataDir.resolve("progress.tsv").toAbsolutePath());
        System.out.println("Open " + url + "  (Ctrl+C to stop)");
        if (openBrowser) tryOpenBrowser(url);
    }

    /**
     * On Windows the JDK's NIO selector creates an AF_UNIX socket pair in the temp directory.
     * When %TEMP% contains an 8.3 short name (e.g. C:\Users\ZBOOKG~1\...) the connect fails with
     * "Unable to establish loopback connection", so point the socket temp dir at the working
     * directory unless the user configured one explicitly.
     */
    private static void fixWindowsLoopbackTempDir() {
        if (System.getProperty("jdk.net.unixdomain.tmpdir") != null) return;
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) return;
        String tmp = System.getProperty("java.io.tmpdir", "");
        if (!tmp.contains("~")) return;
        System.setProperty("jdk.net.unixdomain.tmpdir", Path.of("").toAbsolutePath().toString());
    }

    private static void tryOpenBrowser(String url) {
        try {
            if (java.awt.Desktop.isDesktopSupported()
                    && java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                java.awt.Desktop.getDesktop().browse(new URI(url));
            }
        } catch (Throwable ignored) {
            // headless or no browser available: the URL is printed above
        }
    }
}
