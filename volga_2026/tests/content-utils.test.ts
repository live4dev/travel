import assert from "node:assert/strict";
import test from "node:test";
import { dayIndexFromQuery, routeFeaturesForDay } from "../src/content-utils";
import type { DayRecord, RouteCollection } from "../src/types";

const days: DayRecord[] = [
  { id: "day-one", date: "2026-07-29", dayNumber: 1, title: "Первый день", summary: "Старт", paragraphs: ["Текст"], locations: [], media: [] },
  { id: "day-two", date: "2026-07-30", dayNumber: 2, title: "Второй день", summary: "Путь", paragraphs: ["Текст"], locations: [], media: [] },
];

test("день открывается по id или календарной дате", () => {
  assert.equal(dayIndexFromQuery(days, "day-two"), 1);
  assert.equal(dayIndexFromQuery(days, "2026-07-29"), 0);
  assert.equal(dayIndexFromQuery(days, "missing"), 0);
  assert.equal(dayIndexFromQuery([], null), -1);
});

test("маршрут фильтруется по дню", () => {
  const route: RouteCollection = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { id: "a", dayId: "day-one", name: "Река", mode: "water", accuracy: "verified" }, geometry: { type: "LineString", coordinates: [[45, 55], [46, 56]] } },
      { type: "Feature", properties: { id: "b", dayId: "day-two", name: "Дорога", mode: "road", accuracy: "approximate" }, geometry: { type: "LineString", coordinates: [[46, 56], [47, 57]] } },
    ],
  };
  assert.deepEqual(routeFeaturesForDay(route, "day-one").map((feature) => feature.properties.id), ["a"]);
});
