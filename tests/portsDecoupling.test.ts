import { describe, it, expect } from "vitest";
import type { MatchPort, EnrichedMatchDetailRecord } from "../src/ports/matchPort.ts";
import type { LanguagePort } from "../src/ports/languagePort.ts";
import fs from "node:fs";
import path from "node:path";

describe("Ports and Decoupling", () => {
  it("shouldDefineMatchPortAndLanguagePortInterfacesWithoutCompilerError", () => {
    const dummyMatchPort: MatchPort = {
      getMatchUserAndColor: async () => null,
      saveMatchDetail: async () => {},
      getMatchDetail: async () => null,
      getPendingMatchIds: async () => ({ items: [], totalPending: 0, next: false }),
    };
    expect(dummyMatchPort).toBeDefined();

    const dummyLanguagePort: LanguagePort = {
      resolveUserId: async () => null,
      getUserState: async () => null,
      getUserCourses: async () => [],
      getCourse: async () => null,
      getCourseSections: async () => [],
      getXpSummaries: async () => [],
    };
    expect(dummyLanguagePort).toBeDefined();
  });

  it("shouldEnsureStoreLanguagesDoesNotImportNormalizationModules", () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, "../src/db/storeLanguages.ts"), "utf-8");
    expect(fileContent).not.toMatch(/from ["']\.\.\/normalization/);
  });
});
