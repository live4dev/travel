import type * as YMaps3 from "@yandex/ymaps3-types";

export type YandexMapsApi = typeof YMaps3;

type WindowWithYandexMaps = Window & { ymaps3?: YandexMapsApi };
let loadingPromise: Promise<YandexMapsApi> | null = null;

export const loadYandexMaps = (apiKey: string): Promise<YandexMapsApi> => {
  const current = (window as WindowWithYandexMaps).ymaps3;
  if (current) return current.ready.then(() => current);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<YandexMapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error("Yandex Maps API loading timed out"));
    }, 15_000);
    script.async = true;
    script.dataset.yandexMaps = "true";
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.addEventListener("load", async () => {
      const api = (window as WindowWithYandexMaps).ymaps3;
      if (!api) return reject(new Error("Yandex Maps API is missing after script load"));
      try {
        await api.ready;
        window.clearTimeout(timeout);
        resolve(api);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Yandex Maps API failed to load")), { once: true });
    document.head.append(script);
  }).catch((error) => {
    loadingPromise = null;
    throw error;
  });
  return loadingPromise;
};
