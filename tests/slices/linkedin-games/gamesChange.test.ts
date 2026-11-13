import { describe, it, expect } from "vitest";
import { classify, stateOf, type GameState } from "../../../src/slices/linkedin-games/domain/GamesChange.ts";

const up: GameState = { kind: "mejorando" };
const down: GameState = { kind: "bajando" };
const flat: GameState = { kind: "estable" };
const sigUp: GameState = { kind: "senal", dir: "mejorando" };
const sigDown: GameState = { kind: "senal", dir: "bajando" };
const few: GameState = { kind: "pocos_datos", reason: "cobertura_insuficiente" };
const uncal: GameState = { kind: "pocos_datos", reason: "sin_calibracion" };

describe("stateOf", () => {
  it("shouldMapThePublishedLabelsToTheirStates", () => {
    expect(stateOf({ label: "mejora_sostenida", reason: null, pending: null })).toEqual(up);
    expect(stateOf({ label: "deterioro", reason: "reciente", pending: null })).toEqual(down);
    expect(stateOf({ label: "estable", reason: null, pending: null })).toEqual(flat);
  });
  it("shouldMapAPendingCandidateOnEstableToASenalWithItsDirection", () => {
    expect(stateOf({ label: "estable", reason: null, pending: "deterioro" })).toEqual(sigDown);
    expect(stateOf({ label: "estable", reason: null, pending: "mejora_sostenida" })).toEqual(sigUp);
  });
  it("shouldMapDatosInsuficientesToPocosDatosWithItsReason", () => {
    expect(stateOf({ label: "datos_insuficientes", reason: "sin_calibracion", pending: null })).toEqual(uncal);
    expect(stateOf({ label: "datos_insuficientes", reason: "cobertura_insuficiente", pending: null })).toEqual(few);
  });
  it("shouldFallBackToCoberturaWhenDatosInsuficientesHasNoKnownReason", () => {
    expect(stateOf({ label: "datos_insuficientes", reason: null, pending: null })).toEqual(few);
  });
});

describe("classify", () => {
  it.each([
    ["estable → mejorando", flat, up], ["estable → bajando", flat, down],
    ["mejorando → bajando", up, down], ["bajando → mejorando", down, up],
    ["mejorando → estable", up, flat], ["bajando → estable", down, flat],
  ])("shouldConfirmAChangeWhenThePublishedStateGoes_%s", (_n, from, to) => {
    expect(classify(from, to)).toEqual({ kind: "cambio_confirmado", from, to });
  });

  it.each([["bajando", down], ["mejorando", up], ["estable", flat]])("shouldSaySinCambiosWhenBothEndsAre_%s", (_n, s) => {
    expect(classify(s, s)).toEqual({ kind: "sin_cambios", state: s });
  });

  it("shouldSaySinCambiosWhenAnInitialSenalMeetsAnEstableEnd", () => {
    expect(classify(sigDown, flat)).toEqual({ kind: "sin_cambios", state: flat });
  });

  it.each([["from estable", flat], ["from mejorando", up], ["from an earlier senal", sigDown]])("shouldNeverSaySinCambiosWhenTheFinalStateIsASenal_%s", (_n, from) => {
    const o = classify(from, sigUp);
    expect(o.kind).not.toBe("sin_cambios");
  });

  it("shouldReportAPendingSenalWhenTheInitialStateIsEstable", () => {
    expect(classify(flat, sigDown)).toEqual({ kind: "senal", to: sigDown });
  });

  it("shouldSuppressTheFinalSenalWhenAConfirmedTransitionExists", () => {
    expect(classify(down, sigUp)).toEqual({ kind: "cambio_confirmado", from: down, to: sigUp });
  });

  it.each([["bajando", down, sigDown], ["mejorando", up, sigUp]])("shouldBeNoConcluyenteWhenAConfirmedTrendFallsBackToASenalOfTheSameDirection_%s", (_n, from, to) => {
    expect(classify(from, to)).toEqual({ kind: "no_concluyente", from, to });
  });

  it("shouldTreatEvidenceGainedWhenTheInitialStateHadFewData", () => {
    expect(classify(few, down)).toEqual({ kind: "evidencia", sub: "ganada", from: few, to: down });
  });
  it("shouldTreatEvidenceLostWhenTheFinalStateHasFewData", () => {
    expect(classify(up, few)).toEqual({ kind: "evidencia", sub: "perdida", from: up, to: few });
  });
  it("shouldTreatEvidenceAbsentWhenBothEndsHaveFewData", () => {
    expect(classify(few, uncal)).toEqual({ kind: "evidencia", sub: "ausente", from: few, to: uncal });
  });

  it.each([[few, up], [down, few], [uncal, flat], [flat, uncal], [few, sigUp]])("shouldNeverCallAChangeAnyTransitionToOrFromPocosDatos_%#", (from, to) => {
    expect(classify(from, to).kind).toBe("evidencia");
  });
});
