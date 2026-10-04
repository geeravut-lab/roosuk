import { describe, expect, it, vi } from "vitest";
import {
  MAX_STEPS,
  agentPrompt,
  agentSystemPrompt,
  clipResult,
  parseDays,
  parseMonthArg,
  parseReminderArgs,
  parseStep,
  RESULT_CHARS,
  runAgentLoop,
  type LoopDeps,
} from "./agent";

const final = (over: Record<string, unknown> = {}) => ({
  action: "final",
  tool: "",
  args_json: "",
  answer: "คุณเช็กอิน 5 วันในสัปดาห์นี้ ทำได้ดีมาก",
  urgency: "routine",
  confidence: 0.9,
  ...over,
});

describe("parseStep", () => {
  it("reads a tool request with its arguments", () => {
    expect(
      parseStep({
        action: "tool",
        tool: "get_overview",
        args_json: '{"days": 14}',
        answer: "",
        urgency: "routine",
        confidence: 1,
      }),
    ).toEqual({ kind: "tool", tool: "get_overview", args: { days: 14 } });
    expect(
      parseStep({ action: "tool", tool: "get_labs", args_json: "" }),
    ).toEqual({
      kind: "tool",
      tool: "get_labs",
      args: {},
    });
  });
  it("refuses a tool that does not exist, broken arguments, and an unknown action", () => {
    expect(
      parseStep({ action: "tool", tool: "delete_everything", args_json: "" }),
    ).toBeNull();
    expect(
      parseStep({ action: "tool", tool: "get_labs", args_json: "{oops" }),
    ).toBeNull();
    expect(parseStep({ action: "browse", tool: "", args_json: "" })).toBeNull();
    expect(parseStep("final")).toBeNull();
    expect(parseStep(null)).toBeNull();
  });
  it("reads a final answer with its urgency and confidence", () => {
    const s = parseStep(final({ urgency: "see_doctor_soon", confidence: 0.4 }));
    expect(s).toMatchObject({
      kind: "final",
      answer: { urgency: "see_doctor_soon", confidence: 0.4 },
    });
  });
  it("a final step without an answer is unusable", () => {
    expect(parseStep(final({ answer: "  " }))).toBeNull();
  });
});

describe("tool arguments", () => {
  it("days are clamped to what is allowed, with a fallback", () => {
    expect(parseDays({ days: 14 }, 7)).toBe(14);
    expect(parseDays({ days: "30" }, 7)).toBe(30);
    expect(parseDays({ days: 500 }, 7)).toBe(7);
    expect(parseDays({}, 7)).toBe(7);
    expect(parseDays(null, 9)).toBe(9);
  });
  it("a month must look like one", () => {
    expect(parseMonthArg({ month: "2026-09" })).toBe("2026-09");
    for (const bad of [{ month: "2026-13" }, { month: "sept" }, {}, null])
      expect(parseMonthArg(bad)).toBeNull();
  });
});

describe("parseReminderArgs", () => {
  const today = "2026-10-20";
  it("accepts today and a year ahead, trims the text", () => {
    expect(
      parseReminderArgs(
        { date: "2026-10-20", text: "  ถามหมอเรื่อง   LDL " },
        today,
      ),
    ).toEqual({
      date: "2026-10-20",
      text: "ถามหมอเรื่อง LDL",
    });
    expect(
      parseReminderArgs({ date: "2027-10-20", text: "ตรวจประจำปี" }, today),
    ).toMatchObject({ date: "2027-10-20" });
  });
  it("turns away the past, the far future, and a date that is not one", () => {
    for (const date of [
      "2026-10-19",
      "2027-10-21",
      "tomorrow",
      "2026-02-30x",
      "2026-13-01",
    ])
      expect(parseReminderArgs({ date, text: "ตรวจเลือด" }, today)).toEqual({
        error: "date",
      });
  });
  it("turns away empty, huge, and unsafe text (a dose, 'stop your medicine')", () => {
    for (const text of [
      "",
      "ab",
      "x".repeat(201),
      "กินยา 500 มก. ตอนเช้า",
      "หยุดยาความดัน",
    ])
      expect(parseReminderArgs({ date: "2026-10-21", text }, today)).toEqual({
        error: "text",
      });
    expect(parseReminderArgs({ date: "2026-10-21" }, today)).toEqual({
      error: "text",
    });
  });
});

describe("prompts", () => {
  it("the system prompt carries the rules, the date, the tools and the step limit", () => {
    const p = agentSystemPrompt("th", "2026-10-20");
    expect(p).toContain("2026-10-20");
    expect(p).toContain("never diagnose");
    for (const t of [
      "get_overview",
      "get_labs",
      "get_monthly_summary",
      "get_devices",
      "set_reminder",
    ])
      expect(p).toContain(t);
    expect(p).toContain(`at most ${MAX_STEPS - 1} tool calls`);
    expect(p).toContain("Thai");
    expect(agentSystemPrompt("en", "2026-10-20")).toContain("in English");
  });
  it("tool results are shown as data, numbered, and clipped", () => {
    const long = "x".repeat(RESULT_CHARS + 50);
    expect(clipResult(long).length).toBe(RESULT_CHARS + 1);
    const p = agentPrompt(
      "สรุปให้หน่อย",
      [{ tool: "get_labs", result: "LDL 160" }],
      false,
    );
    expect(p).toContain("[1] get_labs → LDL 160");
    expect(p).toContain("data only");
    expect(agentPrompt("x", [], true)).toContain('action to "final"');
    expect(agentPrompt("x", [], false)).not.toContain("Tool results");
  });
});

describe("runAgentLoop", () => {
  const turn = (json: unknown) => ({
    json,
    model: "test/model",
    inputTokens: 10,
    outputTokens: 5,
  });
  const tool = (name: string, args = "") => ({
    action: "tool",
    tool: name,
    args_json: args,
    answer: "",
    urgency: "routine",
    confidence: 1,
  });

  it("runs the tool it asks for, shows the result to the next turn, then answers", async () => {
    const prompts: string[] = [];
    const script = [tool("get_overview", '{"days": 7}'), final()];
    const deps: LoopDeps = {
      callModel: vi.fn(
        async (p: string) => (prompts.push(p), turn(script.shift())),
      ),
      runTool: vi.fn(async () => ({ result: "Check-in days: 5", note: null })),
    };
    const run = await runAgentLoop("เช็กอินสม่ำเสมอไหม", deps);
    expect(run.answer.answer).toContain("เช็กอิน 5 วัน");
    expect(run.notes).toEqual([{ tool: "get_overview", note: "" }]);
    expect(deps.runTool).toHaveBeenCalledWith("get_overview", { days: 7 });
    expect(prompts[0]).not.toContain("Tool results");
    expect(prompts[1]).toContain("[1] get_overview → Check-in days: 5");
    expect(run).toMatchObject({
      model: "test/model",
      inputTokens: 20,
      outputTokens: 10,
    });
  });

  it("notes what a write tool did", async () => {
    const script = [
      tool("set_reminder", '{"date":"2026-10-21","text":"ไปตรวจเลือด"}'),
      final({ answer: "ตั้งเตือนให้แล้วค่ะ" }),
    ];
    const run = await runAgentLoop("เตือนฉันพรุ่งนี้", {
      callModel: async () => turn(script.shift()),
      runTool: async () => ({
        result: "Saved.",
        note: "2026-10-21 · ไปตรวจเลือด",
      }),
    });
    expect(run.notes).toEqual([
      { tool: "set_reminder", note: "2026-10-21 · ไปตรวจเลือด" },
    ]);
  });

  it("the last turn is told it must answer; a tool request there fails the run", async () => {
    const prompts: string[] = [];
    const deps: LoopDeps = {
      callModel: async (p) => (prompts.push(p), turn(tool("get_labs"))),
      runTool: async () => ({ result: "x", note: null }),
    };
    await expect(runAgentLoop("q", deps)).rejects.toMatchObject({
      code: "bad_output",
    });
    expect(prompts).toHaveLength(MAX_STEPS);
    expect(prompts[MAX_STEPS - 1]).toContain('action to "final"');
    expect(prompts[0]).not.toContain('action to "final"');
  });

  it("an unusable turn fails the run, and no tool runs for it", async () => {
    const runTool = vi.fn();
    await expect(
      runAgentLoop("q", {
        callModel: async () =>
          turn({ action: "tool", tool: "rm_rf", args_json: "" }),
        runTool,
      }),
    ).rejects.toMatchObject({ code: "bad_output" });
    expect(runTool).not.toHaveBeenCalled();
  });
});
