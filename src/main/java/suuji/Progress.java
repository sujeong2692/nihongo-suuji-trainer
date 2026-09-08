package suuji;

import java.time.LocalDate;
import java.util.Locale;

/**
 * Spaced-repetition state of one item (SM-2 variant).
 * Persisted as one TSV line by ProgressStore.
 */
public final class Progress {
    public static final int MASTERED_INTERVAL = 21; // days

    public final String id;
    public int reps;          // consecutive successful reviews
    public int interval;      // days until next review
    public double ease = 2.5; // SM-2 ease factor
    public long due;          // epoch day of next review (0 = unscheduled)
    public int lapses;
    public int seen;          // total reviews (0 = never studied)
    public int correct;
    public int wrong;
    public long last;         // epoch day of last review

    public Progress(String id) {
        this.id = id;
    }

    public boolean isNew() { return seen == 0; }
    public boolean isDue(long today) { return seen > 0 && due <= today; }

    public String status(long today) {
        if (seen == 0) return "new";
        if (interval >= MASTERED_INTERVAL) return "mastered";
        return "learning";
    }

    /**
     * Apply a review with SM-2 quality q (0..5). q below 3 is a failure.
     * Failures are rescheduled for today so they come back within the same session.
     */
    public void rate(int q, long today) {
        q = Math.max(0, Math.min(5, q));
        seen++;
        last = today;
        if (q < 3) {
            wrong++;
            if (reps > 0) lapses++;
            reps = 0;
            interval = 0;
            due = today;
            ease = Math.max(1.3, ease - 0.2);
            return;
        }
        correct++;
        reps++;
        if (reps == 1) interval = (q == 5) ? 4 : 1;
        else if (reps == 2) interval = 6;
        else interval = Math.max(interval + 1, (int) Math.round(interval * ease));
        ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        due = today + interval;
    }

    /** Mark as already known: schedules far out so it counts as mastered. */
    public void markMastered(long today) {
        if (seen == 0) seen = 1;
        reps = Math.max(reps, 3);
        interval = Math.max(interval, 30);
        due = today + interval;
        last = today;
    }

    public String toJson(long today) {
        return new Json.Obj()
                .put("status", status(today))
                .put("reps", reps)
                .put("interval", interval)
                .put("ease", ease)
                .put("due", due == 0 ? "" : LocalDate.ofEpochDay(due).toString())
                .put("dueIn", due == 0 ? 0 : due - today)
                .put("isDue", isDue(today))
                .put("seen", seen)
                .put("correct", correct)
                .put("wrong", wrong)
                .put("lapses", lapses)
                .put("last", last == 0 ? "" : LocalDate.ofEpochDay(last).toString())
                .build();
    }

    // ---- TSV persistence ----
    static final String HEADER = "id\treps\tinterval\tease\tdue\tlapses\tseen\tcorrect\twrong\tlast";

    String toTsv() {
        return String.join("\t", id, String.valueOf(reps), String.valueOf(interval),
                String.format(Locale.ROOT, "%.3f", ease), String.valueOf(due), String.valueOf(lapses),
                String.valueOf(seen), String.valueOf(correct), String.valueOf(wrong), String.valueOf(last));
    }

    static Progress fromTsv(String line) {
        String[] f = line.split("\t", -1);
        if (f.length < 10) throw new IllegalArgumentException("bad progress line: " + line);
        Progress p = new Progress(f[0]);
        p.reps = Integer.parseInt(f[1]);
        p.interval = Integer.parseInt(f[2]);
        p.ease = Double.parseDouble(f[3]);
        p.due = Long.parseLong(f[4]);
        p.lapses = Integer.parseInt(f[5]);
        p.seen = Integer.parseInt(f[6]);
        p.correct = Integer.parseInt(f[7]);
        p.wrong = Integer.parseInt(f[8]);
        p.last = Long.parseLong(f[9]);
        return p;
    }
}
