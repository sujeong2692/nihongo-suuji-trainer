package suuji;

import java.util.List;
import java.util.Locale;

/** Minimal JSON writer (the app has no external dependencies). */
public final class Json {
    private Json() {}

    public static String quote(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"') sb.append("\\\"");
            else if (c == '\\') sb.append("\\\\");
            else if (c == '\n') sb.append("\\n");
            else if (c == '\r') sb.append("\\r");
            else if (c == '\t') sb.append("\\t");
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.append('"').toString();
    }

    public static String strArray(List<String> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(quote(items.get(i)));
        }
        return sb.append(']').toString();
    }

    /** Joins already-serialised JSON fragments into an array. */
    public static String array(List<String> rawItems) {
        return "[" + String.join(",", rawItems) + "]";
    }

    public static String error(String message) {
        return new Obj().put("error", message).build();
    }

    /** Fluent object builder. */
    public static final class Obj {
        private final StringBuilder sb = new StringBuilder("{");
        private boolean first = true;

        private void key(String k) {
            if (!first) sb.append(',');
            first = false;
            sb.append(quote(k)).append(':');
        }

        public Obj put(String k, String v) { key(k); sb.append(quote(v)); return this; }
        public Obj put(String k, long v) { key(k); sb.append(v); return this; }
        public Obj put(String k, double v) { key(k); sb.append(String.format(Locale.ROOT, "%.2f", v)); return this; }
        public Obj put(String k, boolean v) { key(k); sb.append(v); return this; }
        public Obj putRaw(String k, String rawJson) { key(k); sb.append(rawJson); return this; }

        public String build() { return sb.toString() + "}"; }
    }
}
