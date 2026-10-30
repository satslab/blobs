import { describe, expect, it } from "vite-plus/test";
import {
  activeBands,
  activePosition,
  activePositionAt,
  activeTime,
  stepActivePosition,
} from "./ActiveHoursField.logic";

describe("active hours strip", () => {
  it("places a 00:00 end on the right edge and stores it back as 00:00", () => {
    expect(activePosition("end", "00:00")).toBe(1440);
    expect(activePosition("start", "00:00")).toBe(0);
    expect(activeTime(1440)).toBe("00:00");
    expect(activeTime(activePosition("start", "22:15"))).toBe("22:15");
  });

  it("highlights the active span, splits overnight ranges at midnight and fills a full day", () => {
    expect(activeBands(8 * 60, 22 * 60)).toEqual([[480, 1320]]);
    expect(activeBands(22 * 60, 8 * 60)).toEqual([
      [1320, 1440],
      [0, 480],
    ]);
    expect(activeBands(22 * 60, 1440)).toEqual([[1320, 1440]]);
    expect(activeBands(0, 1440)).toEqual([[0, 1440]]);
    expect(activeBands(600, 600)).toEqual([[0, 1440]]);
  });

  it("snaps pointer positions to 30 minutes within each thumb's bounds", () => {
    expect(activePositionAt("start", 0.5 + 10 / 1440, 0, 1440)).toBe(720);
    expect(activePositionAt("start", 1, 0, 1440)).toBe(1410);
    expect(activePositionAt("end", 0, 1440, 0)).toBe(30);
    expect(activePositionAt("end", 1, 0, 0)).toBe(1440);
  });

  it("steps off-grid values onto the grid in the pressed direction", () => {
    expect(stepActivePosition("start", 22 * 60 + 15, 1, 1440)).toBe(1350);
    expect(stepActivePosition("start", 22 * 60 + 15, -1, 1440)).toBe(1320);
    expect(stepActivePosition("start", 1320, 1, 1440, 60)).toBe(1380);
    expect(stepActivePosition("end", 30, -1, 0)).toBe(30);
    expect(stepActivePosition("start", 1410, 1, 1440)).toBe(1410);
  });

  it("steps one grid line past the other thumb so boundaries never meet inside the strip", () => {
    expect(activePositionAt("start", (12 * 60) / 1440, 11 * 60, 12 * 60)).toBe(750);
    expect(activePositionAt("end", (12 * 60) / 1440, 13 * 60, 12 * 60)).toBe(690);
    expect(stepActivePosition("start", 11 * 60 + 30, 1, 12 * 60)).toBe(750);
    expect(stepActivePosition("end", 12 * 60 + 30, -1, 12 * 60)).toBe(690);
    expect(stepActivePosition("start", 11 * 60 + 30, 1, 12 * 60, 60)).toBe(13 * 60);
  });
});
