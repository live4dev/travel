import type { LngLat, YMap, YMapFeature } from "@yandex/ymaps3-types";
import { allRouteCoordinates, dayCoordinates } from "./content-utils";
import type { DayRecord, LocationAccuracy, RouteCollection, RouteFeature, TransportMode, Trip } from "./types";
import { loadYandexMaps } from "./yandex-map";

const modeColors: Record<TransportMode, string> = {
  water: "#197b87",
  road: "#df684c",
  walk: "#d49336",
  unknown: "#6d7773",
};

const coordinateBounds = (coordinates: [number, number][]) => coordinates.reduce((bounds, coordinate) => ({
  minX: Math.min(bounds.minX, coordinate[0]),
  maxX: Math.max(bounds.maxX, coordinate[0]),
  minY: Math.min(bounds.minY, coordinate[1]),
  maxY: Math.max(bounds.maxY, coordinate[1]),
}), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

const mapZoomFor = (coordinates: [number, number][], fallback: number): number => {
  if (coordinates.length < 2) return Math.max(fallback, 9.5);
  const bounds = coordinateBounds(coordinates);
  const span = Math.max(bounds.maxX - bounds.minX, (bounds.maxY - bounds.minY) * 1.6);
  if (span < 0.02) return 12.5;
  if (span < 0.1) return 10.5;
  if (span < 0.5) return 8.5;
  if (span < 2) return 6.8;
  return fallback;
};

const centerFor = (coordinates: [number, number][], fallback: [number, number]): [number, number] => {
  if (!coordinates.length) return fallback;
  const bounds = coordinateBounds(coordinates);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
};

const strokeStyle = (feature: RouteFeature, active: boolean) => ({
  zIndex: active ? 420 : 310,
  stroke: [{
    width: active ? 7 : 4,
    color: modeColors[feature.properties.mode],
    opacity: feature.properties.accuracy === "approximate" ? (active ? 0.78 : 0.48) : (active ? 1 : 0.72),
  }],
});

export class JourneyMap {
  private map: YMap | null = null;
  private routeFeatures = new Map<string, YMapFeature>();
  private activeDayId = "";

  constructor(
    private readonly trip: Trip,
    private readonly days: DayRecord[],
    private readonly route: RouteCollection,
    private readonly mapElement: HTMLElement,
    private readonly fallbackElement: HTMLElement,
    private readonly messageElement: HTMLElement,
    private readonly onSelectDay: (dayId: string) => void,
  ) {}

  async initialize(): Promise<void> {
    this.renderFallback();
    const apiKey = (import.meta.env.VITE_YANDEX_MAPS_API_KEY as string | undefined)?.trim();
    if (!apiKey) {
      this.showFallback("Интерактивная карта не подключена — показываем локальную схему маршрута.");
      return;
    }
    try {
      const api = await loadYandexMaps(apiKey);
      this.map = new api.YMap(this.mapElement, {
        location: { center: this.trip.mapCenter, zoom: this.trip.mapZoom },
        behaviors: ["drag", "scrollZoom", "dblClick", "pinchZoom"],
        mode: "auto",
        theme: "light",
        copyrightsPosition: "bottom right",
      });
      this.map.addChild(new api.YMapDefaultSchemeLayer({}));
      this.map.addChild(new api.YMapDefaultFeaturesLayer({ zIndex: 250 }));

      for (const feature of this.route.features) {
        const mapFeature = new api.YMapFeature({
          id: feature.properties.id,
          geometry: { type: "LineString", coordinates: feature.geometry.coordinates as LngLat[] },
          style: strokeStyle(feature, false),
        });
        this.routeFeatures.set(feature.properties.id, mapFeature);
        this.map.addChild(mapFeature);
      }

      this.days.forEach((day) => {
        const coordinate = day.locations[0]?.coordinates ?? dayCoordinates(day, this.route)[0];
        if (!coordinate) return;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "map-marker";
        marker.dataset.dayId = day.id;
        marker.innerHTML = `<span>${day.dayNumber}</span>`;
        marker.setAttribute("aria-label", `${day.title}, ${day.date}`);
        marker.addEventListener("click", () => this.onSelectDay(day.id));
        this.map?.addChild(new api.YMapMarker({ coordinates: coordinate, zIndex: 700 }, marker));
      });
      this.fallbackElement.classList.remove("is-visible");
      this.messageElement.hidden = true;
      const selectedDayId = this.activeDayId;
      this.activeDayId = "";
      if (selectedDayId) this.selectDay(selectedDayId);
    } catch (error) {
      console.warn("Yandex Maps API is unavailable", error);
      this.showFallback("Карта Яндекса недоступна — показываем локальную схему маршрута.");
    }
  }

  selectDay(dayId: string): void {
    if (!dayId || this.activeDayId === dayId) return;
    this.activeDayId = dayId;
    const day = this.days.find((item) => item.id === dayId);
    document.querySelectorAll<HTMLElement>(".map-marker, .fallback-marker").forEach((marker) => {
      marker.classList.toggle("is-active", marker.dataset.dayId === dayId);
    });
    document.querySelectorAll<SVGPathElement>(".fallback-segment").forEach((segment) => {
      segment.classList.toggle("is-active", segment.dataset.dayId === dayId);
    });
    this.route.features.forEach((feature) => {
      this.routeFeatures.get(feature.properties.id)?.update({
        style: strokeStyle(feature, feature.properties.dayId === dayId),
      });
    });
    if (!day || !this.map) return;
    const coordinates = dayCoordinates(day, this.route);
    this.map.update({
      location: {
        center: centerFor(coordinates, this.trip.mapCenter),
        zoom: mapZoomFor(coordinates, this.trip.mapZoom),
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
      },
    });
  }

  private showFallback(message: string): void {
    this.fallbackElement.classList.add("is-visible");
    this.messageElement.textContent = message;
    this.messageElement.hidden = false;
  }

  private renderFallback(): void {
    const coordinates = allRouteCoordinates(this.route);
    if (!coordinates.length) return;
    const bounds = coordinateBounds(coordinates);
    const width = Math.max(0.001, bounds.maxX - bounds.minX);
    const height = Math.max(0.001, bounds.maxY - bounds.minY);
    const project = ([longitude, latitude]: [number, number]): [number, number] => [
      90 + ((longitude - bounds.minX) / width) * 820,
      630 - ((latitude - bounds.minY) / height) * 560,
    ];
    const svg = this.fallbackElement.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
    const routeMarkup = this.route.features.map((feature) => {
      const d = feature.geometry.coordinates.map((coordinate, index) => `${index ? "L" : "M"}${project(coordinate).join(" ")}`).join(" ");
      return `<path class="fallback-segment fallback-segment--${feature.properties.mode} fallback-segment--${feature.properties.accuracy}" data-day-id="${feature.properties.dayId}" d="${d}" />`;
    }).join("");
    const markerMarkup = this.days.map((day) => {
      const coordinate = day.locations[0]?.coordinates ?? dayCoordinates(day, this.route)[0];
      if (!coordinate) return "";
      const [x, y] = project(coordinate);
      return `<g class="fallback-marker" data-day-id="${day.id}" tabindex="0" role="button" aria-label="${day.title}" transform="translate(${x} ${y})"><circle r="19"/><text y="5">${day.dayNumber}</text></g>`;
    }).join("");
    svg.innerHTML = `${routeMarkup}${markerMarkup}`;
    svg.querySelectorAll<SVGGElement>(".fallback-marker").forEach((marker) => {
      const activate = (): void => this.onSelectDay(marker.dataset.dayId ?? "");
      marker.addEventListener("click", activate);
      marker.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") activate();
      });
    });
  }
}
