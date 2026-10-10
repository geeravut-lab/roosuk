import { describe, expect, it } from "vitest";
import { countTags, tagsOf, type LoggedMeal } from "./foodtags";
import { evaluateWatch, weekKey } from "./watch";

const meal = (
  meal_date: string,
  ...items: { name: string; catalog_key?: string; servings?: number }[]
): LoggedMeal => ({ meal_date, items });

describe("tagsOf", () => {
  it("uses the table's tags for a catalogue dish", () => {
    expect(
      [...tagsOf({ name: "ข้าวขาหมู", catalog_key: "pork_leg_rice" })].sort(),
    ).toEqual(
      ["purine_mod", "refined_carb", "satfat_high", "sodium_high"].sort(),
    );
  });

  it("reads a name the table does not know", () => {
    expect(tagsOf({ name: "ต้มเลือดหมู" }).has("purine_high")).toBe(true);
    expect(tagsOf({ name: "ตับหมูทอด" }).has("purine_high")).toBe(true);
    expect(tagsOf({ name: "ตับหมูทอด" }).has("fried")).toBe(true);
    expect(tagsOf({ name: "Singha beer" }).has("alcohol")).toBe(true);
    expect(tagsOf({ name: "กุ้งแช่น้ำปลา" }).has("purine_mod")).toBe(true);
    expect(tagsOf({ name: "oysters" }).has("purine_high")).toBe(true);
  });

  it("a high-purine word is not also 'moderate'", () => {
    const t = tagsOf({ name: "หอยแมลงภู่อบ" });
    expect(t.has("purine_high")).toBe(true);
    expect(t.has("purine_mod")).toBe(false);
  });

  it("does not count a drink that says it has no sugar", () => {
    expect(tagsOf({ name: "น้ำอัดลมซีโร่" }).has("sugar_high")).toBe(false);
    expect(tagsOf({ name: "ชาเขียวไม่หวาน" }).has("sugar_high")).toBe(false);
    expect(tagsOf({ name: "ชาเย็น" }).has("sugar_high")).toBe(true);
  });

  it("plain food has no tags", () => {
    expect(tagsOf({ name: "ต้มจืดผักกาด" }).size).toBe(0);
    expect(tagsOf({ name: "กล้วย", catalog_key: "banana" }).size).toBe(0);
  });
});

describe("countTags", () => {
  it("adds servings and names the dishes that drive the count", () => {
    const c = countTags([
      meal("2026-10-05", { name: "ตับหมูทอด", servings: 1 }),
      meal(
        "2026-10-06",
        { name: "ตับหมูทอด", servings: 0.5 },
        { name: "หอยแครง", servings: 1 },
      ),
    ]);
    expect(c.get("purine_high")).toEqual({
      servings: 2.5,
      top: [
        { name: "ตับหมูทอด", servings: 1.5 },
        { name: "หอยแครง", servings: 1 },
      ],
    });
  });
});

describe("evaluateWatch (gout)", () => {
  const today = "2026-10-10";
  const base = [
    meal("2026-10-01", {
      name: "ข้าวกะเพราหมูสับ",
      catalog_key: "basil_pork_rice",
    }),
    meal("2026-10-02", { name: "กล้วย", catalog_key: "banana" }),
    meal("2026-10-03", { name: "สลัดผัก", catalog_key: "salad_plain" }),
  ];

  it("says nothing when too little was logged", () => {
    const r = evaluateWatch(
      ["gout"],
      [meal("2026-10-09", { name: "ตับหมูทอด" })],
      today,
    );
    expect(r).toEqual({ alerts: [], loggedDays30: 1, lowData: true });
  });

  it("raises a note for high-purine servings in the last 7 days, stronger when repeated", () => {
    const one = evaluateWatch(
      ["gout"],
      [...base, meal("2026-10-08", { name: "ตับหมูทอด" })],
      today,
    );
    expect(one.alerts).toHaveLength(1);
    expect(one.alerts[0]).toMatchObject({
      condition: "gout",
      tag: "purine_high",
      level: "notice",
      servings7: 1,
    });
    const many = evaluateWatch(
      ["gout"],
      [
        ...base,
        meal("2026-10-06", { name: "ตับหมูทอด" }),
        meal("2026-10-08", { name: "หอยแครงลวก" }),
        meal("2026-10-09", { name: "ปลากะตักทอด" }),
      ],
      today,
    );
    expect(many.alerts[0]).toMatchObject({ level: "caution", servings7: 3 });
    expect(many.alerts[0].top.map((x) => x.name)).toContain("หอยแครงลวก");
  });

  it("looks at the last 7 days for the level, but reports the 30-day total too", () => {
    const r = evaluateWatch(
      ["gout"],
      [
        ...base,
        meal("2026-09-20", { name: "ตับหมูทอด" }),
        meal("2026-09-22", { name: "ตับหมูทอด" }),
        meal("2026-10-09", { name: "ตับหมูทอด" }),
      ],
      today,
    );
    expect(r.alerts[0]).toMatchObject({
      level: "notice",
      servings7: 1,
      servings30: 3,
    });
  });

  it("ignores meals before the 30-day window and conditions it cannot read", () => {
    const old = [
      ...base,
      meal("2026-08-01", { name: "ตับหมูทอด" }),
      meal("2026-08-02", { name: "ตับหมูทอด" }),
    ];
    expect(evaluateWatch(["gout"], old, today).alerts).toEqual([]);
    expect(
      evaluateWatch(
        ["thyroid", "nonsense"],
        [...base, meal("2026-10-09", { name: "ตับหมูทอด" })],
        today,
      ).alerts,
    ).toEqual([]);
  });

  it("a person without the condition gets no note for the same meals", () => {
    const meals = [...base, meal("2026-10-09", { name: "ตับหมูทอด" })];
    expect(evaluateWatch([], meals, today).alerts).toEqual([]);
    expect(evaluateWatch(["hypertension"], meals, today).alerts).toEqual([]);
  });

  it("sorts the stronger note first", () => {
    const meals = [
      ...base,
      meal("2026-10-05", { name: "เบียร์", servings: 5 }),
      meal("2026-10-06", { name: "ตับหมูทอด" }),
    ];
    const r = evaluateWatch(["gout"], meals, today);
    expect(r.alerts.map((a) => [a.tag, a.level])).toEqual([
      ["alcohol", "caution"],
      ["purine_high", "notice"],
    ]);
  });
});

describe("weekKey", () => {
  it("is the Monday of the week", () => {
    expect(weekKey("2026-10-10")).toBe("2026-10-05"); // Saturday
    expect(weekKey("2026-10-05")).toBe("2026-10-05");
    expect(weekKey("2026-10-11")).toBe("2026-10-05"); // Sunday
  });
});
