import { describe, expect, it } from "vite-plus/test";
import {
  quietBands,
  quietPosition,
  quietPositionAt,
  quietTime,
  stepQuietPosition,
} from "./QuietHoursField.logic";

describe("quiet hours strip", () => {
  it("places a 00:00 end on the right edge and stores it back as 00:00", () => {
    expect(quietPosition("end", "00:00")).toBe(1440);
    expect(quietPosition("start", "00:00")).toBe(0);
    expect(quietTime(1440)).toBe("00:00");
    expect(quietTime(quietPosition("start", "22:15"))).toBe("22:15");
  });

  it("splits overnight ranges at midnight and treats equal times as off", () => {
    expect(quietBands(22 * 60, 8 * 60)).toEqual([
      [1320, 1440],
      [0, 480],
    ]);
    expect(quietBands(9 * 60, 17 * 60)).toEqual([[540, 1020]]);
    expect(quietBands(22 * 60, 1440)).toEqual([[1320, 1440]]);
    expect(quietBands(0, 1440)).toEqual([]);
    expect(quietBands(600, 600)).toEqual([]);
  });

  it("snaps pointer positions to 30 minutes within each thumb's bounds", () => {
    expect(quietPositionAt("start", 0.5 + 10 / 1440)).toBe(720);
    expect(quietPositionAt("start", 1)).toBe(1410);
    expect(quietPositionAt("end", 0)).toBe(30);
    expect(quietPositionAt("end", 1)).toBe(1440);
  });

  it("steps off-grid values onto the grid in the pressed direction", () => {
    expect(stepQuietPosition("start", 22 * 60 + 15, 1)).toBe(1350);
    expect(stepQuietPosition("start", 22 * 60 + 15, -1)).toBe(1320);
    expect(stepQuietPosition("start", 1320, 1, 60)).toBe(1380);
    expect(stepQuietPosition("end", 30, -1)).toBe(30);
    expect(stepQuietPosition("start", 1410, 1)).toBe(1410);
  });
});
