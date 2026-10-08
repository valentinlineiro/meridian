import { describe, it, expect } from "vitest";
import { getLanguages } from "../src/application/getLanguages.ts";
import { getLanguageCourse } from "../src/application/getLanguageCourse.ts";
import { getLanguageXp } from "../src/application/getLanguageXp.ts";
import type { LanguagePort } from "../src/ports/languagePort.ts";

describe("Language Application Use Cases", () => {
  const fakeLanguagePort: LanguagePort = {
    async resolveUserId(explicitUserId) {
      if (explicitUserId === "not-found") return null;
      return explicitUserId ?? "user-123";
    },
    async getUserState(userId) {
      return {
        user_id: userId,
        total_xp: 5000,
        streak: 15,
        current_course_id: "course-fr",
        updated_at: "2026-09-30T10:00:00Z",
        total_xp_observed_at: "2026-09-30T10:00:00Z",
        streak_observed_at: "2026-09-30T10:00:00Z",
        current_course_observed_at: "2026-09-30T10:00:00Z",
      };
    },
    async getUserCourses(userId) {
      return [
        {
          course_id: "course-fr",
          title: "Demo Gamma",
          learning_language: "xc",
          from_language: "en",
          subject: "language",
          topic: "basics",
          xp: 5000,
          last_seen_at: "2026-09-30T10:00:00Z",
        },
      ];
    },
    async getCourse(userId, courseId) {
      if (courseId !== "course-fr") return null;
      return {
        course_id: "course-fr",
        title: "Demo Gamma",
        learning_language: "xc",
        from_language: "en",
        subject: "language",
        topic: "basics",
        xp: 5000,
        last_seen_at: "2026-09-30T10:00:00Z",
      };
    },
    async getCourseSections(userId, courseId) {
      return [
        {
          section_id: "sec-1",
          section_index: 1,
          type: "unit",
          cefr_level: "A1",
          cefr_sublevel: "1",
          completed_units: 5,
          total_units: 10,
          last_seen_at: "2026-09-30T10:00:00Z",
        },
      ];
    },
    async getXpSummaries(userId, days) {
      return [
        {
          user_id: userId,
          date: "2026-09-29",
          gained_xp: 50,
          num_sessions: 2,
          total_session_time: 300,
          streak_extended: 1,
          frozen: 0,
          repaired: 0,
          updated_at: "2026-09-29T23:59:59Z",
        },
        {
          user_id: userId,
          date: "2026-09-28",
          gained_xp: 40,
          num_sessions: 1,
          total_session_time: 150,
          streak_extended: 1,
          frozen: 0,
          repaired: 0,
          updated_at: "2026-09-28T23:59:59Z",
        },
      ];
    },
  };

  it("shouldReturnLanguagesOverviewWhenValidUserExists", async () => {
    const result = await getLanguages(fakeLanguagePort, "user-123");
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-123");
    expect(result!.totalXp).toBe(5000);
    expect(result!.courses).toHaveLength(1);
    expect(result!.courses[0]!.courseId).toBe("course-fr");
  });

  it("shouldReturnNullOverviewWhenUserCannotBeResolved", async () => {
    const result = await getLanguages(fakeLanguagePort, "not-found");
    expect(result).toBeNull();
  });

  it("shouldReturnCourseDetailsWithSectionsWhenCourseExists", async () => {
    const result = await getLanguageCourse(fakeLanguagePort, "course-fr", "user-123");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("Expected ok");
    expect(result.course.title).toBe("Demo Gamma");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.cefrLevel).toBe("A1");
  });

  it("shouldReturnNullCourseWhenCourseDoesNotExist", async () => {
    const result = await getLanguageCourse(fakeLanguagePort, "non-existent-course", "user-123");
    expect(result.kind).toBe("no_course");
  });

  it("shouldReturnNullCourseWhenUserCannotBeResolved", async () => {
    const result = await getLanguageCourse(fakeLanguagePort, "course-fr", "not-found");
    expect(result.kind).toBe("no_user");
  });

  it("shouldReturnXpSummariesSortedAscendingWhenIsAscIsTrue", async () => {
    const result = await getLanguageXp(fakeLanguagePort, 30, true, "user-123");
    expect(result).not.toBeNull();
    expect(result!.summaries).toHaveLength(2);
    expect(result!.summaries[0]!.date).toBe("2026-09-28");
    expect(result!.summaries[1]!.date).toBe("2026-09-29");
    expect(result!.summaries[1]!.gainedXp).toBe(50);
    expect(result!.summaries[1]!.streakExtended).toBe(true);
  });

  it("shouldReturnXpSummariesSortedDescendingWhenIsAscIsFalse", async () => {
    const result = await getLanguageXp(fakeLanguagePort, 30, false, "user-123");
    expect(result).not.toBeNull();
    expect(result!.summaries).toHaveLength(2);
    expect(result!.summaries[0]!.date).toBe("2026-09-29");
    expect(result!.summaries[1]!.date).toBe("2026-09-28");
  });

  it("shouldReturnNullXpSummariesWhenUserCannotBeResolved", async () => {
    const result = await getLanguageXp(fakeLanguagePort, 30, true, "not-found");
    expect(result).toBeNull();
  });
});
