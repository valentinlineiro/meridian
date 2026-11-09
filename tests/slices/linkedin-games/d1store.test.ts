import { describe, it, expect } from "vitest";
import { D1DayRecordStore } from "../../../src/slices/linkedin-games/infrastructure/D1DayRecordStore.ts";
import { ingestSnapshot } from "../../../src/api/import.ts";
import { setupTestDb } from "../../helpers/testDb.ts";

const setup = () => {
  const { db, d1 } = setupTestDb();
  db.exec("INSERT INTO users VALUES ('u1','t')");
  const at = "2026-11-09T12:00:00.000Z";
  return { store: new D1DayRecordStore(d1, (a) => ingestSnapshot(d1, { ...a, createdAt: at })) };
};
const day = (games: Record<string, unknown>) => ({ schema: 1 as const, date: "2026-11-08", games });

describe("D1DayRecordStore", () => {
  it("shouldServeTheLastWrittenVersionWhenTwoVersionsShareTheSameCreationInstant", async () => {
    for (let i = 0; i < 20; i++) { // the old tie-break was a random uuid: a few rounds make a wrong pick near-certain
      const { store } = setup();
      await store.append("u1", day({ zip: { scoreSeconds: 8 } }));
      await store.append("u1", day({ zip: { scoreSeconds: 9 } }));
      expect((await store.latest("u1", "2026-11-08"))!.games).toEqual({ zip: { scoreSeconds: 9 } });
      expect((await store.all("u1")).map((d) => d.games)).toEqual([{ zip: { scoreSeconds: 9 } }]);
    }
  });
});
