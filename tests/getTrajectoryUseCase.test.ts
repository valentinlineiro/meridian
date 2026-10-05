import { describe, it, expect, vi } from "vitest";
import { getTrajectoryUseCase } from "../src/application/getTrajectoryUseCase.ts";
import type { TrajectoryPort } from "../src/ports/trajectoryPort.ts";
import { NotFoundError } from "../src/application/errors.ts";

function createMockPort(overrides: Partial<TrajectoryPort> = {}): TrajectoryPort {
  return {
    resolveUserId: async (id) => id ?? "1000001",
    getChessTrajectoryData: async () => ({
      startedAt: "2026-03-01T00:00:00.000Z",
      endedAt: "2026-09-01T00:00:00.000Z",
      totalGames: 160,
      activeDays: 80,
      whiteGames: 80, whiteDecided: 80,
      whiteWins: 60,
      blackGames: 80, blackDecided: 80,
      blackWins: 40,
      h1: { whiteGames: 40, whiteDecided: 40, whiteWins: 30, blackGames: 40, blackDecided: 40, blackWins: 20 },
      h2: { whiteGames: 40, whiteDecided: 40, whiteWins: 30, blackGames: 40, blackDecided: 40, blackWins: 20 },
    }),
    getLanguagesTrajectoryData: async () => ({
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-09-01T00:00:00.000Z",
      activeDays: 120,
      h1: { courses: [{ courseId: "DUOLINGO_XC_EN", xp: 8000 }] },
      h2: {
        courses: [
          { courseId: "DUOLINGO_XB_EN", xp: 9000 },
          { courseId: "DUOLINGO_XC_EN", xp: 1000 },
        ],
      },
    }),
    ...overrides,
  };
}

describe("getTrajectoryUseCase", () => {
  it("shouldThrowNotFoundErrorWhenUserIdCannotBeResolved", async () => {
    const port = createMockPort({ resolveUserId: async () => null });
    await expect(getTrajectoryUseCase(port, { userId: "unknown" })).rejects.toThrow(NotFoundError);
  });

  it("shouldComputeCombinedTemporalSpanAndFindingsWhenBothVerticalsPresent", async () => {
    const port = createMockPort();
    const res = await getTrajectoryUseCase(port, {});

    expect(res.userId).toBe("1000001");
    expect(res.temporalSpan.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(res.temporalSpan.endedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(res.temporalSpan.totalDays).toBe(243);
    expect(res.findings).toHaveLength(2);
  });

  it("shouldComputeTemporalSpanFromSingleVerticalWhenOtherVerticalHasNoData", async () => {
    const port = createMockPort({
      getLanguagesTrajectoryData: async () => ({
        startedAt: null,
        endedAt: null,
        activeDays: 0,
        h1: { courses: [] },
        h2: { courses: [] },
      }),
    });
    const res = await getTrajectoryUseCase(port, {});
    expect(res.temporalSpan.startedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(res.temporalSpan.endedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.category).toBe("chess");
  });

  it("shouldComputeTemporalSpanFromLanguagesWhenChessHasNoData", async () => {
    const port = createMockPort({
      getChessTrajectoryData: async () => ({
        startedAt: null,
        endedAt: null,
        totalGames: 0,
        activeDays: 0,
        whiteGames: 0, whiteDecided: 0,
        whiteWins: 0,
        blackGames: 0, blackDecided: 0,
        blackWins: 0,
        h1: { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 },
        h2: { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 },
      }),
    });
    const res = await getTrajectoryUseCase(port, {});
    expect(res.temporalSpan.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(res.temporalSpan.endedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.category).toBe("languages");
  });

  it("shouldReturnNullTemporalSpanAndEmptyFindingsWhenZeroActivityAcrossBothVerticals", async () => {
    const port = createMockPort({
      getChessTrajectoryData: async () => ({
        startedAt: null,
        endedAt: null,
        totalGames: 0,
        activeDays: 0,
        whiteGames: 0, whiteDecided: 0,
        whiteWins: 0,
        blackGames: 0, blackDecided: 0,
        blackWins: 0,
        h1: { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 },
        h2: { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 },
      }),
      getLanguagesTrajectoryData: async () => ({
        startedAt: null,
        endedAt: null,
        activeDays: 0,
        h1: { courses: [] },
        h2: { courses: [] },
      }),
    });
    const res = await getTrajectoryUseCase(port, {});
    expect(res.temporalSpan.startedAt).toBeNull();
    expect(res.temporalSpan.endedAt).toBeNull();
    expect(res.temporalSpan.totalDays).toBeNull();
    expect(res.findings).toEqual([]);
  });

  it("shouldPassExplicitUserIdToResolveUserIdWhenProvided", async () => {
    const resolveUserIdMock = vi.fn().mockResolvedValue("user-xyz");
    const port = createMockPort({ resolveUserId: resolveUserIdMock });
    const res = await getTrajectoryUseCase(port, { userId: "user-xyz" });

    expect(resolveUserIdMock).toHaveBeenCalledWith("user-xyz");
    expect(res.userId).toBe("user-xyz");
  });

  it("shouldComputeZeroTotalDaysWhenStartedAtEqualsEndedAt", async () => {
    const port = createMockPort({
      getChessTrajectoryData: async () => ({
        startedAt: "2026-05-01T12:00:00.000Z",
        endedAt: "2026-05-01T12:00:00.000Z",
        totalGames: 2,
        activeDays: 1,
        whiteGames: 1, whiteDecided: 1,
        whiteWins: 1,
        blackGames: 1, blackDecided: 1,
        blackWins: 0,
        h1: { whiteGames: 1, whiteDecided: 1, whiteWins: 1, blackGames: 0, blackDecided: 0, blackWins: 0 },
        h2: { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 1, blackDecided: 1, blackWins: 0 },
      }),
      getLanguagesTrajectoryData: async () => ({
        startedAt: null,
        endedAt: null,
        activeDays: 0,
        h1: { courses: [] },
        h2: { courses: [] },
      }),
    });
    const res = await getTrajectoryUseCase(port, {});
    expect(res.temporalSpan.startedAt).toBe("2026-05-01T12:00:00.000Z");
    expect(res.temporalSpan.endedAt).toBe("2026-05-01T12:00:00.000Z");
    expect(res.temporalSpan.totalDays).toBe(0);
    expect(res.findings).toEqual([]);
  });
});
