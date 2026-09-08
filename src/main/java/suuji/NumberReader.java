package suuji;

import java.util.ArrayList;
import java.util.List;

/**
 * Converts a non-negative integer into its standard Japanese cardinal-number reading
 * (hiragana), including the sound changes (音便) that occur before 百/千/兆.
 *
 * Scope: 0 through 9999_9999_9999 (just under 1兆 = 10^12), i.e. up to 億 (10^8) groups
 * of 4 digits, which covers everything a learner practices before the far rarer 兆 range.
 * This is a deliberate scope cut: 兆-level sound changes are less consistently documented
 * and are not needed for the practice modes this app offers.
 */
public final class NumberReader {
    private NumberReader() {}

    public static final long MAX = 9999_9999_9999L;

    // digit (1-9) plain reading, used for the ones place and as the base for tens/thousands
    private static final String[] DIGIT = {
            "", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"
    };

    // 十(10s place): index = digit 1-9 -> reading of digit*10, no sound changes ever
    private static final String[] JUU = {
            "", "じゅう", "にじゅう", "さんじゅう", "よんじゅう", "ごじゅう",
            "ろくじゅう", "ななじゅう", "はちじゅう", "きゅうじゅう"
    };

    // 百(100s place): index = digit 1-9 -> reading of digit*100 (いち omitted for 1; b/p sound changes)
    private static final String[] HYAKU = {
            "", "ひゃく", "にひゃく", "さんびゃく", "よんひゃく", "ごひゃく",
            "ろっぴゃく", "ななひゃく", "はっぴゃく", "きゅうひゃく"
    };

    // 千(1000s place): index = digit 1-9 -> reading of digit*1000 (いち omitted for 1; z/sokuon changes)
    private static final String[] SEN = {
            "", "せん", "にせん", "さんぜん", "よんせん", "ごせん",
            "ろくせん", "ななせん", "はっせん", "きゅうせん"
    };

    /** Reads a 1-9999 group (no big unit suffix). Returns "" for 0. */
    private static String readGroup(int n) {
        if (n == 0) return "";
        if (n < 0 || n > 9999) throw new IllegalArgumentException("group out of range: " + n);
        StringBuilder sb = new StringBuilder();
        int thousands = n / 1000, hundreds = (n / 100) % 10, tens = (n / 10) % 10, ones = n % 10;
        sb.append(SEN[thousands]);
        sb.append(HYAKU[hundreds]);
        sb.append(JUU[tens]);
        sb.append(DIGIT[ones]);
        return sb.toString();
    }

    /** Full hiragana reading of n (0 <= n <= MAX). 0 reads as "れい". */
    public static String read(long n) {
        if (n < 0 || n > MAX) throw new IllegalArgumentException("out of supported range (0.." + MAX + "): " + n);
        if (n == 0) return "れい";
        long oku = n / 100_000_000L;
        long rest = n % 100_000_000L;
        long man = rest / 10_000L;
        long low = rest % 10_000L;
        StringBuilder sb = new StringBuilder();
        if (oku > 0) sb.append(readGroup((int) oku)).append("おく");
        if (man > 0) sb.append(readGroup((int) man)).append("まん");
        if (low > 0 || sb.length() == 0) sb.append(readGroup((int) low));
        return sb.toString();
    }

    /** Digit-grouped display form, e.g. 1234567 -> "1,234,567". */
    public static String display(long n) {
        return String.format("%,d", n);
    }

    /** A step-by-step breakdown of how the reading was built, for an explanatory UI. */
    public static List<String> breakdown(long n) {
        List<String> steps = new ArrayList<>();
        if (n == 0) { steps.add("0 = れい"); return steps; }
        long oku = n / 100_000_000L, rest = n % 100_000_000L;
        long man = rest / 10_000L, low = rest % 10_000L;
        if (oku > 0) steps.add(oku + "億 = " + readGroup((int) oku) + "おく");
        if (man > 0) steps.add(man + "万 = " + readGroup((int) man) + "まん");
        if (low > 0) steps.add(low + " = " + readGroup((int) low));
        return steps;
    }
}
