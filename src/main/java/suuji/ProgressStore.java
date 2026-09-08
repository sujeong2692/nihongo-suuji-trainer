package suuji;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** File-backed store of per-item progress (data/progress.tsv). All access is synchronized. */
public final class ProgressStore {
    private final Path file;
    private final Map<String, Progress> map = new HashMap<>();

    public ProgressStore(Path file) {
        this.file = file;
        load();
    }

    public static long today() {
        return LocalDate.now().toEpochDay();
    }

    private void load() {
        if (!Files.exists(file)) return;
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if (line.isBlank() || line.startsWith("id\t")) continue;
                Progress p = Progress.fromTsv(line);
                map.put(p.id, p);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        System.out.println("Loaded progress for " + map.size() + " items from " + file.toAbsolutePath());
    }

    /** Returns the stored progress or a fresh (unsaved) one. */
    public synchronized Progress peek(String id) {
        Progress p = map.get(id);
        return p != null ? p : new Progress(id);
    }

    /** Applies a mutation to the item's progress and saves the file. */
    public synchronized Progress update(String id, Consumer<Progress> fn) {
        Progress p = map.computeIfAbsent(id, Progress::new);
        fn.accept(p);
        save();
        return p;
    }

    /** Applies a mutation to many items and saves once. */
    public synchronized void updateAll(Iterable<String> ids, Consumer<Progress> fn) {
        for (String id : ids) fn.accept(map.computeIfAbsent(id, Progress::new));
        save();
    }

    public synchronized void resetAll(Iterable<String> ids) {
        for (String id : ids) map.remove(id);
        save();
    }

    /** Number of items reviewed today. */
    public synchronized int reviewedOn(long day) {
        int n = 0;
        for (Progress p : map.values()) if (p.last == day) n++;
        return n;
    }

    private void save() {
        try {
            Path parent = file.toAbsolutePath().getParent();
            if (parent != null) Files.createDirectories(parent);
            List<String> lines = new ArrayList<>(map.size() + 1);
            lines.add(Progress.HEADER);
            for (Progress p : map.values()) if (p.seen > 0) lines.add(p.toTsv());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.write(tmp, lines, StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicFailed) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
