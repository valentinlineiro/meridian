import { describe, it, expect } from "vitest";
import { ExportGameResults } from "../../../src/slices/linkedin-games/application/ExportGameResults.ts";
import { ImportGameResults } from "../../../src/slices/linkedin-games/application/ImportGameResults.ts";
import { NotFoundError } from "../../../src/application/errors.ts";
import { InMemoryDayRecordStore, owners } from "./fakes.ts";

const OWNER = "owner@example.com";
const NOW = () => new Date(Date.UTC(2026, 10, 9, 12, 0, 0));
const setup = () => {
  const store = new InMemoryDayRecordStore(), lookup = owners({ [OWNER]: "u1" });
  return { store, importer: new ImportGameResults(lookup, store, NOW), exporter: new ExportGameResults(lookup, store) };
};

describe("ExportGameResults", () => {
  it("shouldExportOneLinePerPlayedGameInTheColumnsTheImportReads", async () => {
    const { importer, exporter } = setup();
    await importer.execute({ ownerEmail: OWNER, today: "2026-11-09", apply: true, text: "2026-11-08\nZ, 6, 12\nT, 43\n2026-11-09\nQ, 39, 29" });
    expect(await exporter.execute({ ownerEmail: OWNER })).toBe(
      "fecha,juego,miseg,mediaseg\n2026-11-08,tango,43,\n2026-11-08,zip,6,12\n2026-11-09,queens,39,29\n");
  });

  it("shouldRestoreTheSameResultsWhenTheExportIsImportedIntoAnEmptyStore", async () => {
    const a = setup();
    await a.importer.execute({ ownerEmail: OWNER, today: "2026-11-09", apply: true, text: "2026-11-08\nZ, 6, 12\nT, 43, 51" });
    const csv = await a.exporter.execute({ ownerEmail: OWNER });
    const b = setup();
    const r = await b.importer.execute({ ownerEmail: OWNER, today: "2026-11-09", apply: true, text: csv });
    expect(r.errors).toEqual([]);
    expect(await b.exporter.execute({ ownerEmail: OWNER })).toBe(csv);
  });

  it("shouldRefuseWhenThereIsNoOwnerAccount", async () => {
    const store = new InMemoryDayRecordStore();
    await expect(new ExportGameResults(owners({}), store).execute({ ownerEmail: "x@y.z" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
