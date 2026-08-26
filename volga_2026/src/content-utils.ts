import type { DayRecord, RouteCollection, RouteFeature } from "./types";

export const DAY_QUERY_KEY = "day";

export const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]!);

export const formatDayDate = (date: string): string => new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
}).format(new Date(`${date}T12:00:00`));

export const dayIndexFromQuery = (days: DayRecord[], value: string | null): number => {
  if (!days.length) return -1;
  const index = days.findIndex((day) => day.id === value || day.date === value);
  return index >= 0 ? index : 0;
};

export const routeFeaturesForDay = (route: RouteCollection, dayId: string): RouteFeature[] =>
  route.features.filter((feature) => feature.properties.dayId === dayId);

export const allRouteCoordinates = (route: RouteCollection): [number, number][] =>
  route.features.flatMap((feature) => feature.geometry.coordinates);

export const dayCoordinates = (day: DayRecord, route: RouteCollection): [number, number][] => {
  const locations = day.locations.map((location) => location.coordinates);
  return locations.length ? locations : routeFeaturesForDay(route, day.id).flatMap((feature) => feature.geometry.coordinates);
};
