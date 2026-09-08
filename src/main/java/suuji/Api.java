package suuji;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/** JSON API under /api/. Parameters are accepted as query string or form-encoded POST body. */
public final class Api implements HttpHandler {
    private final ItemRepository repo;
    private final ProgressStore store;
    private final Random rnd = new Random();

    // Korean display labels for the fixed category set the data files use.
    private static final Map<String, String> CATEGORY_LABEL = Map.of(
            "basic", "기초 한자어 수사",
            "wago", "고유어 수사",
            "place", "자릿수 (십·백·천·만)",
            "age", "나이 (歳)",
            "counter", "조수사 (助数詞)",
            "date", "날짜",
            "time", "시간");

    public Api(ItemRepository repo, ProgressStore store) {
        this.repo = repo;
        this.store = store;
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String route = path.startsWith("/api") ? path.substring(4) : path;
        try {
            Map<String, String> p = params(ex);
            String json = route(ex.getRequestMethod(), route, p);
            if (json == null) send(ex, 404, Json.error("not found: " + route));
            else send(ex, 200, json);
        } catch (IllegalArgumentException e) {
            send(ex, 400, Json.error(e.getMessage()));
        } catch (Exception e) {
            e.printStackTrace();
            send(ex, 500, Json.error(String.valueOf(e)));
        }
    }

    private String route(String method, String route, Map<String, String> p) {
        boolean post = "POST".equalsIgnoreCase(method);
        if (route.equals("/categories")) return categories();
        if (route.equals("/stats")) return stats();
        if (route.equals("/items")) return listItems(p);
        if (route.startsWith("/items/")) return detail(route.substring("/items/".length()));
        if (route.equals("/review/next")) return reviewNext(p);
        if (route.equals("/review") && post) return review(p);
        if (route.equals("/quiz")) return quiz(p);
        if (route.equals("/quiz/answer") && post) return quizAnswer(p);
        if (route.equals("/dictation/check") && post) return dictationCheck(p);
        if (route.equals("/bignum/read")) return bignumRead(p);
        if (route.equals("/bignum/quiz")) return bignumQuiz(p);
        if (route.equals("/bignum/check") && post) return bignumCheck(p);
        if (route.equals("/progress/mark") && post) return mark(p);
        if (route.equals("/progress/reset") && post) {
            p.put("status", "reset");
            return mark(p);
        }
        return null;
    }

    // ---------------------------------------------------------------- categories / items

    private String categories() {
        long today = ProgressStore.today();
        List<String> nodes = new ArrayList<>();
        for (String[] cs : repo.categoryTree()) {
            String category = cs[0], sub = cs[1];
            List<Item> items = repo.bySubcategory(category, sub);
            int[] c = count(items, today);
            nodes.add(new Json.Obj()
                    .put("category", category)
                    .put("categoryLabel", CATEGORY_LABEL.getOrDefault(category, category))
                    .put("subcategory", sub)
                    .put("total", c[0]).put("new", c[1]).put("learning", c[2]).put("mastered", c[3]).put("due", c[4])
                    .build());
        }
        List<String> cats = new ArrayList<>();
        for (String cat : repo.categories()) {
            int[] c = count(repo.byCategory(cat), today);
            cats.add(new Json.Obj()
                    .put("category", cat)
                    .put("categoryLabel", CATEGORY_LABEL.getOrDefault(cat, cat))
                    .put("total", c[0]).put("new", c[1]).put("learning", c[2]).put("mastered", c[3]).put("due", c[4])
                    .build());
        }
        return new Json.Obj().putRaw("categories", Json.array(cats)).putRaw("subcategories", Json.array(nodes)).build();
    }

    private String listItems(Map<String, String> p) {
        long today = ProgressStore.today();
        String category = p.getOrDefault("category", "all");
        String subcategory = p.getOrDefault("subcategory", "all");
        String status = p.getOrDefault("status", "all");
        List<Item> list = repo.search(p.getOrDefault("q", ""), category, subcategory);
        List<String> items = new ArrayList<>();
        for (Item it : list) {
            Progress pr = store.peek(it.id());
            if (!status.equals("all")) {
                boolean keep = status.equals("due") ? pr.isDue(today) : pr.status(today).equals(status);
                if (!keep) continue;
            }
            items.add(it.toJson(pr, today));
        }
        return new Json.Obj().put("total", items.size()).putRaw("items", Json.array(items)).build();
    }

    private String detail(String id) {
        Item it = requireItem(id);
        long today = ProgressStore.today();
        return it.toJson(store.peek(it.id()), today);
    }

    // ---------------------------------------------------------------- stats

    private String stats() {
        long today = ProgressStore.today();
        Map<String, int[]> byCat = new LinkedHashMap<>();
        int[] total = new int[5];
        for (String cat : repo.categories()) {
            int[] c = count(repo.byCategory(cat), today);
            byCat.put(cat, c);
            for (int i = 0; i < 5; i++) total[i] += c[i];
        }
        List<String> cats = new ArrayList<>();
        for (Map.Entry<String, int[]> e : byCat.entrySet()) {
            cats.add(catJson(e.getKey(), CATEGORY_LABEL.getOrDefault(e.getKey(), e.getKey()), e.getValue()));
        }
        return new Json.Obj()
                .putRaw("categories", Json.array(cats))
                .putRaw("total", catJson("all", "전체", total))
                .put("reviewedToday", store.reviewedOn(today))
                .put("today", LocalDate.now().toString())
                .build();
    }

    private int[] count(List<Item> list, long today) {
        int[] c = new int[5];
        for (Item it : list) {
            Progress pr = store.peek(it.id());
            c[0]++;
            switch (pr.status(today)) {
                case "new" -> c[1]++;
                case "learning" -> c[2]++;
                default -> c[3]++;
            }
            if (pr.isDue(today)) c[4]++;
        }
        return c;
    }

    private static String catJson(String cat, String label, int[] c) {
        return new Json.Obj()
                .put("category", cat).put("label", label)
                .put("total", c[0]).put("new", c[1]).put("learning", c[2]).put("mastered", c[3]).put("due", c[4])
                .build();
    }

    // ---------------------------------------------------------------- SRS review

    private String reviewNext(Map<String, String> p) {
        long today = ProgressStore.today();
        String category = p.getOrDefault("category", "all");
        String subcategory = p.getOrDefault("subcategory", "all");
        int limit = intParam(p, "limit", 20, 1, 500);
        int newLimit = intParam(p, "new", 10, 0, 500);
        List<Item> due = new ArrayList<>();
        List<Item> fresh = new ArrayList<>();
        for (Item it : repo.bySubcategory(category, subcategory)) {
            Progress pr = store.peek(it.id());
            if (pr.isDue(today)) due.add(it);
            else if (pr.isNew()) fresh.add(it);
        }
        due.sort(Comparator.comparingLong(it -> store.peek(it.id()).due));
        List<String> items = new ArrayList<>();
        for (Item it : due) {
            if (items.size() >= limit) break;
            items.add(it.toJson(store.peek(it.id()), today));
        }
        int added = 0;
        for (Item it : fresh) {
            if (items.size() >= limit || added >= newLimit) break;
            items.add(it.toJson(store.peek(it.id()), today));
            added++;
        }
        return new Json.Obj()
                .put("dueTotal", due.size())
                .put("newTotal", fresh.size())
                .putRaw("items", Json.array(items))
                .build();
    }

    private String review(Map<String, String> p) {
        Item it = requireItem(p.get("id"));
        int q = intParam(p, "q", -1, 0, 5);
        long today = ProgressStore.today();
        Progress pr = store.update(it.id(), x -> x.rate(q, today));
        return it.toJson(pr, today);
    }

    // ---------------------------------------------------------------- item quiz

    private String quiz(Map<String, String> p) {
        String category = p.getOrDefault("category", "all");
        String subcategory = p.getOrDefault("subcategory", "all");
        String mode = p.getOrDefault("mode", "reading"); // reading: prompt->reading, prompt: reading->prompt
        if (!mode.equals("reading") && !mode.equals("prompt"))
            throw new IllegalArgumentException("mode must be reading or prompt");
        int n = intParam(p, "n", 10, 1, 100);
        boolean onlyStudied = "studied".equals(p.get("pool"));

        List<Item> pool = repo.bySubcategory(category, subcategory);
        List<Item> candidates = pool;
        if (onlyStudied) {
            candidates = new ArrayList<>();
            for (Item it : pool) if (!store.peek(it.id()).isNew()) candidates.add(it);
            if (candidates.size() < 4) candidates = pool;
        }
        if (candidates.size() < 4) throw new IllegalArgumentException("이 범위는 문항을 만들기에 항목이 부족합니다 (4개 이상 필요)");
        List<Item> shuffled = new ArrayList<>(candidates);
        Collections.shuffle(shuffled, rnd);
        List<String> questions = new ArrayList<>();
        for (Item it : shuffled.subList(0, Math.min(n, shuffled.size()))) questions.add(question(it, mode, pool));
        return new Json.Obj().put("mode", mode).putRaw("questions", Json.array(questions)).build();
    }

    private String question(Item it, String mode, List<Item> pool) {
        String answer = mode.equals("reading") ? it.reading() : it.prompt();
        Set<String> texts = new LinkedHashSet<>();
        texts.add(answer);
        List<Item> shuffled = new ArrayList<>(pool);
        Collections.shuffle(shuffled, rnd);
        for (Item d : shuffled) {
            if (texts.size() >= 4) break;
            if (d == it) continue;
            String t = mode.equals("reading") ? d.reading() : d.prompt();
            if (!t.isEmpty()) texts.add(t);
        }
        List<String> choices = new ArrayList<>(texts);
        Collections.shuffle(choices, rnd);
        String prompt = mode.equals("reading") ? it.prompt() : it.reading();
        return new Json.Obj()
                .put("prompt", prompt)
                .putRaw("choices", Json.strArray(choices))
                .put("answer", choices.indexOf(answer))
                .putRaw("item", it.toJson(store.peek(it.id()), ProgressStore.today()))
                .build();
    }

    private String quizAnswer(Map<String, String> p) {
        Item it = requireItem(p.get("id"));
        boolean correct = Boolean.parseBoolean(p.getOrDefault("correct", "false"));
        long today = ProgressStore.today();
        Progress pr = store.update(it.id(), x -> {
            if (!correct) x.rate(1, today);
            else if (x.isNew() || x.isDue(today)) x.rate(4, today);
            else {
                x.correct++;
                x.last = today;
            }
        });
        return it.toJson(pr, today);
    }

    private String dictationCheck(Map<String, String> p) {
        Item it = requireItem(p.get("id"));
        String typed = normalizeReading(p.getOrDefault("reading", ""));
        String correct = normalizeReading(it.reading());
        boolean ok = typed.equals(correct);
        long today = ProgressStore.today();
        Progress pr = store.update(it.id(), x -> x.rate(ok ? 4 : 1, today));
        return new Json.Obj().put("correct", ok).put("expected", it.reading())
                .putRaw("item", it.toJson(pr, today)).build();
    }

    // ---------------------------------------------------------------- big-number reading (generative)

    /** level -> [min, max] inclusive range of numbers to draw from. */
    private static long[] levelRange(String level) {
        return switch (level) {
            case "2" -> new long[]{10, 99};
            case "3" -> new long[]{100, 999};
            case "4" -> new long[]{1000, 9999};
            case "man" -> new long[]{10_000, 99_999_999L};
            case "oku" -> new long[]{100_000_000L, NumberReader.MAX};
            default -> throw new IllegalArgumentException("level must be one of 2, 3, 4, man, oku");
        };
    }

    private long randomInRange(long min, long max) {
        if (max <= min) return min;
        return min + (long) (rnd.nextDouble() * (max - min + 1));
    }

    private String bignumRead(Map<String, String> p) {
        String s = p.get("number");
        if (s == null || s.isBlank()) throw new IllegalArgumentException("number parameter required");
        long n;
        try {
            n = Long.parseLong(s.trim().replace(",", ""));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("bad number: " + s);
        }
        String reading = NumberReader.read(n);
        List<String> steps = new ArrayList<>();
        for (String step : NumberReader.breakdown(n)) steps.add(Json.quote(step));
        return new Json.Obj()
                .put("number", n)
                .put("display", NumberReader.display(n))
                .put("reading", reading)
                .putRaw("breakdown", "[" + String.join(",", steps) + "]")
                .build();
    }

    private String bignumQuiz(Map<String, String> p) {
        String level = p.getOrDefault("level", "3");
        long[] range = levelRange(level);
        int n = intParam(p, "n", 10, 1, 50);
        List<String> questions = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            long target = randomInRange(range[0], range[1]);
            String answer = NumberReader.read(target);
            Set<String> texts = new LinkedHashSet<>();
            texts.add(answer);
            int guard = 0;
            while (texts.size() < 4 && guard++ < 100) {
                long d = randomInRange(range[0], range[1]);
                texts.add(NumberReader.read(d));
            }
            List<String> choices = new ArrayList<>(texts);
            Collections.shuffle(choices, rnd);
            questions.add(new Json.Obj()
                    .put("number", target)
                    .put("display", NumberReader.display(target))
                    .putRaw("choices", Json.strArray(choices))
                    .put("answer", choices.indexOf(answer))
                    .build());
        }
        return new Json.Obj().put("level", level).putRaw("questions", Json.array(questions)).build();
    }

    private String bignumCheck(Map<String, String> p) {
        String s = p.get("number");
        if (s == null || s.isBlank()) throw new IllegalArgumentException("number parameter required");
        long n;
        try {
            n = Long.parseLong(s.trim().replace(",", ""));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("bad number: " + s);
        }
        String typed = normalizeReading(p.getOrDefault("reading", ""));
        String correct = normalizeReading(NumberReader.read(n));
        boolean ok = typed.equals(correct);
        List<String> steps = new ArrayList<>();
        for (String step : NumberReader.breakdown(n)) steps.add(Json.quote(step));
        return new Json.Obj().put("correct", ok).put("expected", NumberReader.read(n))
                .put("number", n).put("display", NumberReader.display(n))
                .putRaw("breakdown", "[" + String.join(",", steps) + "]")
                .build();
    }

    private static String normalizeReading(String s) {
        return s.trim().replace(" ", "").replace("　", "");
    }

    // ---------------------------------------------------------------- bulk progress

    private String mark(Map<String, String> p) {
        String status = p.getOrDefault("status", "mastered");
        long today = ProgressStore.today();
        List<String> targets = new ArrayList<>();
        String id = p.get("id");
        if (id != null && !id.isEmpty()) {
            targets.add(requireItem(id).id());
        } else {
            String category = p.getOrDefault("category", "all");
            String subcategory = p.getOrDefault("subcategory", "all");
            for (Item it : repo.bySubcategory(category, subcategory)) targets.add(it.id());
        }
        switch (status) {
            case "mastered" -> store.updateAll(targets, x -> x.markMastered(today));
            case "reset" -> store.resetAll(targets);
            default -> throw new IllegalArgumentException("status must be mastered or reset");
        }
        return new Json.Obj().put("updated", targets.size()).putRaw("stats", stats()).build();
    }

    // ---------------------------------------------------------------- helpers

    private Item requireItem(String id) {
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("id parameter required");
        Item it = repo.get(id.trim());
        if (it == null) throw new IllegalArgumentException("unknown item id: " + id);
        return it;
    }

    private static int intParam(Map<String, String> p, String name, int def, int min, int max) {
        String s = p.get(name);
        if (s == null || s.isBlank()) {
            if (def < min || def > max) throw new IllegalArgumentException(name + " parameter required");
            return def;
        }
        try {
            int v = Integer.parseInt(s.trim());
            if (v < min || v > max) throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
            return v;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("bad " + name + ": " + s);
        }
    }

    private static Map<String, String> params(HttpExchange ex) throws IOException {
        Map<String, String> m = new HashMap<>();
        parseInto(ex.getRequestURI().getRawQuery(), m);
        if ("POST".equalsIgnoreCase(ex.getRequestMethod())) {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String ct = ex.getRequestHeaders().getFirst("Content-Type");
            if (ct == null || ct.contains("x-www-form-urlencoded")) parseInto(body, m);
        }
        return m;
    }

    private static void parseInto(String s, Map<String, String> m) {
        if (s == null || s.isEmpty()) return;
        for (String kv : s.split("&")) {
            if (kv.isEmpty()) continue;
            int i = kv.indexOf('=');
            String k = i < 0 ? kv : kv.substring(0, i);
            String v = i < 0 ? "" : kv.substring(i + 1);
            m.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
        }
    }

    static void send(HttpExchange ex, int code, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(code, body.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(body);
        }
    }
}
