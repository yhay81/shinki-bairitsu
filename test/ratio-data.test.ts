import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Pair = [number | null, number | null];
type RecordRow = {
  p: string;
  o: string;
  a: Pair[];
  f: Pair[];
  t: Pair[];
};

const root = process.cwd();
const index = JSON.parse(readFileSync(resolve(root, "public/data/index.json"), "utf8"));
const records = JSON.parse(
  readFileSync(resolve(root, "public/data/ratios.json"), "utf8"),
) as RecordRow[];
const find = (placeId: string, occupationId: string) =>
  records.find((item) => item.p === placeId && item.o === occupationId)!;

describe("matched official occupation openings and job-seeker tables", () => {
  it("retains verified source metadata and dimensions", () => {
    expect(index).toMatchObject({
      schemaVersion: 1,
      asOf: "2026-08-02",
      edition: "2023〜2025年度（現行表）",
      years: [2023, 2024, 2025],
      placeCount: 48,
      prefectureCount: 47,
      groupCount: 11,
      occupationCount: 73,
      recordCount: 3504,
      employmentCount: 3,
      pairCount: 31_536,
      sourceValueCount: 63_072,
      availableSourceValueCount: 62_938,
      unavailableSourceValueCount: 134,
      calculableRatioCount: 30_457,
      unavailablePairCount: 134,
      zeroDenominatorCount: 945,
      zeroOpeningCount: 1785,
      sexTotalChecked: 31_536,
      sexTotalMismatchCount: 7260,
      employmentIdentityChecked: { openings: 10_378, seekers: 10_512 },
      nationalSumChecked: { openings: 645, seekers: 657 },
    });
    expect(index.sources).toEqual([
      {
        kind: "openings",
        url: "https://www.mhlw.go.jp/toukei/list/xls/114-1d-06.xlsx",
        bytes: 991_012,
        sha256: "99e2cad815251763fdb05265e6a8b0be29d04db9615e997646db402591dca8c2",
      },
      {
        kind: "seekers",
        url: "https://www.mhlw.go.jp/toukei/list/xls/114-1d-07.xlsx",
        bytes: 22_874_210,
        sha256: "83ca2a2cdc31a51f075c057456ee4a7cadea8db63925e890cc711156e62b2be8",
      },
    ]);
  });

  it("contains one unique row for every place and occupation", () => {
    expect(records).toHaveLength(3504);
    expect(new Set(records.map((item) => `${item.p}|${item.o}`)).size).toBe(3504);
    expect(index.places).toHaveLength(48);
    expect(index.groups).toHaveLength(11);
    expect(index.occupations).toHaveLength(73);
    expect(index.coverage).toHaveLength(48);
  });

  it("keeps every occupation attached to one published group", () => {
    const groupIds = new Set(index.groups.map((item: { id: string }) => item.id));
    for (const occupation of index.occupations as { group: string; id: string; name: string }[]) {
      expect(occupation.id).toMatch(/^\d{2}$/u);
      expect(occupation.name.length).toBeGreaterThan(1);
      expect(groupIds.has(occupation.group)).toBe(true);
    }
    expect(index.occupations.find((item: { id: string }) => item.id === "10")).toMatchObject({
      group: "Ｂ",
      name: "情報処理・通信技術者",
    });
    expect(index.occupations.find((item: { id: string }) => item.id === "36")).toMatchObject({
      group: "Ｅ",
      name: "介護サービス職業従事者",
    });
  });

  it("retains nationwide and known prefecture source values", () => {
    expect(find("JP-00", "10").a).toEqual([
      [208_361, 61_696],
      [214_801, 62_964],
      [208_705, 66_533],
    ]);
    expect(find("JP-00", "25").a.at(-1)).toEqual([602_900, 879_909]);
    expect(find("JP-00", "36").a.at(-1)).toEqual([822_436, 134_010]);
    expect(find("JP-13", "36").f.at(-1)).toEqual([71_022, 4375]);
    expect(find("JP-47", "25").t.at(-1)).toEqual([3576, 3630]);
  });

  it("keeps missing and zero-denominator states separate", () => {
    let sourceValues = 0;
    let calculable = 0;
    let unavailable = 0;
    let zeroDenominator = 0;
    let zeroOpening = 0;
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(["a", "f", "o", "p", "t"]);
      for (const employment of ["a", "f", "t"] as const) {
        expect(record[employment]).toHaveLength(3);
        for (const [opening, seeker] of record[employment]) {
          for (const value of [opening, seeker]) {
            if (value !== null) {
              expect(Number.isInteger(value)).toBe(true);
              expect(value).toBeGreaterThanOrEqual(0);
              sourceValues += 1;
            }
          }
          if (opening === null || seeker === null) unavailable += 1;
          else if (seeker === 0) zeroDenominator += 1;
          else calculable += 1;
          if (opening === 0) zeroOpening += 1;
        }
      }
    }
    expect({ sourceValues, calculable, unavailable, zeroDenominator, zeroOpening }).toEqual({
      sourceValues: 62_938,
      calculable: 30_457,
      unavailable: 134,
      zeroDenominator: 945,
      zeroOpening: 1785,
    });
    expect(statSync(resolve(root, "public/data/ratios.json")).size).toBeLessThan(520_000);
  });

  it("preserves employment identities and classification coverage", () => {
    for (const record of records) {
      for (let year = 0; year < 3; year += 1) {
        for (let side = 0; side < 2; side += 1) {
          const all = record.a[year][side];
          const full = record.f[year][side];
          const part = record.t[year][side];
          if (all !== null && full !== null && part !== null) expect(all).toBe(full + part);
        }
      }
    }
    const nationwide = index.coverage.find((item: { p: string }) => item.p === "JP-00");
    expect(nationwide.a.at(-1)).toEqual([836_948, 4_362_423]);
    expect((nationwide.a.at(-1)[0] / nationwide.a.at(-1)[1]) * 100).toBeCloseTo(19.1854, 4);
  });
});
