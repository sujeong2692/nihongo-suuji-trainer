package suuji;

/** One practice entry: a number/date/counter phrase and its correct hiragana reading. */
public record Item(String id, String category, String subcategory, String prompt, String reading,
                    String korean, String note) {

    public String toJson(Progress p, long today) {
        Json.Obj obj = new Json.Obj()
                .put("id", id)
                .put("category", category)
                .put("subcategory", subcategory)
                .put("prompt", prompt)
                .put("reading", reading)
                .put("korean", korean)
                .put("note", note)
                .put("irregular", !note.isEmpty());
        if (p != null) obj.putRaw("progress", p.toJson(today));
        return obj.build();
    }
}
