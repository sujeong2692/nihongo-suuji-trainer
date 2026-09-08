package suuji;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** In-memory catalogue of practice items, loaded from /items.tsv on the classpath. */
public final class ItemRepository {
    private final List<Item> all;
    private final Map<String, Item> byId = new LinkedHashMap<>();
    private final Map<String, List<Item>> byCategory = new LinkedHashMap<>();
    private final Map<String, List<Item>> bySubcategory = new LinkedHashMap<>();

    private ItemRepository(List<Item> list) {
        this.all = Collections.unmodifiableList(list);
        for (Item it : list) {
            byId.put(it.id(), it);
            byCategory.computeIfAbsent(it.category(), c -> new ArrayList<>()).add(it);
            bySubcategory.computeIfAbsent(key(it.category(), it.subcategory()), c -> new ArrayList<>()).add(it);
        }
    }

    private static String key(String category, String subcategory) {
        return category + "/" + subcategory;
    }

    public static ItemRepository loadDefault() throws IOException {
        try (InputStream in = ItemRepository.class.getResourceAsStream("/items.tsv")) {
            if (in == null) throw new IllegalStateException("items.tsv not found on classpath");
            return new ItemRepository(parse(in));
        }
    }

    static List<Item> parse(InputStream in) throws IOException {
        List<Item> list = new ArrayList<>(400);
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        int n = 0;
        while ((line = r.readLine()) != null) {
            n++;
            if (line.isBlank() || line.startsWith("#")) continue;
            String[] f = line.split("\t", -1);
            if (f.length < 7) throw new IOException("items.tsv line " + n + ": expected 7 fields, got " + f.length);
            list.add(new Item(f[0].trim(), f[1].trim(), f[2].trim(), f[3].trim(), f[4].trim(), f[5].trim(), f[6].trim()));
        }
        return list;
    }

    public List<Item> all() { return all; }

    public Item get(String id) { return byId.get(id); }

    public List<Item> byCategory(String category) {
        if (category == null || category.isBlank() || category.equals("all")) return all;
        return byCategory.getOrDefault(category, List.of());
    }

    public List<Item> bySubcategory(String category, String subcategory) {
        if (subcategory == null || subcategory.isBlank() || subcategory.equals("all")) return byCategory(category);
        return bySubcategory.getOrDefault(key(category, subcategory), List.of());
    }

    /** Ordered list of every (category, subcategory) pair, in first-seen order. */
    public List<String[]> categoryTree() {
        List<String[]> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Item it : all) {
            String k = key(it.category(), it.subcategory());
            if (seen.add(k)) out.add(new String[]{it.category(), it.subcategory()});
        }
        return out;
    }

    public List<String> categories() {
        return new ArrayList<>(byCategory.keySet());
    }

    /** Search by prompt, reading (kana-insensitive) or Korean gloss. */
    public List<Item> search(String query, String category, String subcategory) {
        String q = query == null ? "" : query.trim();
        List<Item> pool = bySubcategory(category, subcategory);
        if (q.isEmpty()) return pool;
        String qn = normalizeKana(q);
        List<Item> out = new ArrayList<>();
        for (Item it : pool) {
            if (it.prompt().contains(q) || it.korean().contains(q)) { out.add(it); continue; }
            if (normalizeKana(it.reading()).contains(qn)) out.add(it);
        }
        return out;
    }

    /** Katakana to hiragana so that queries typed in either script match. */
    static String normalizeKana(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= 0x30A1 && c <= 0x30F6) c = (char) (c - 0x60);
            sb.append(c);
        }
        return sb.toString();
    }
}
