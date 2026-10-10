import { describe, expect, it } from "vitest";
import { fitWithin } from "./resize";

describe("fitWithin", () => {
  it("shrinks the long side to the limit and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });
  it("never enlarges", () => {
    expect(fitWithin(640, 480, 1280)).toEqual({ width: 640, height: 480 });
  });
  it("copes with an empty picture", () => {
    expect(fitWithin(0, 0, 720)).toEqual({ width: 1, height: 1 });
  });
});
