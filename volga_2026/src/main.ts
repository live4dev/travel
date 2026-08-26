import "./styles.css";
import daysData from "../content/days.json";
import tripData from "../content/trip.json";
import { DAY_QUERY_KEY, dayIndexFromQuery, escapeHtml, formatDayDate } from "./content-utils";
import { JourneyMap } from "./map-controller";
import type { DayRecord, MediaAsset, MediaManifest, RouteCollection, Trip } from "./types";

const trip = tripData as Trip;
const days = daysData as unknown as DayRecord[];
const app = document.querySelector<HTMLDivElement>("#app")!;
const loading = document.querySelector<HTMLElement>("#loading");

if (!app) throw new Error("Контейнер приложения не найден");

const srcset = (variants: Array<{ width: number; src: string }>): string =>
  variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ");

const photoMarkup = (photo: MediaAsset): string => `
  <figure class="day-photo">
    <button type="button" data-lightbox="${escapeHtml(photo.id)}" aria-label="Открыть фотографию: ${escapeHtml(photo.alt)}">
      <picture>
        <source type="image/avif" srcset="${srcset(photo.variants.avif)}" sizes="(max-width: 760px) 88vw, 36vw" />
        <source type="image/webp" srcset="${srcset(photo.variants.webp)}" sizes="(max-width: 760px) 88vw, 36vw" />
        <img src="${photo.src}" width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" />
      </picture>
    </button>
    ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ""}
  </figure>`;

const dayMarkup = (day: DayRecord, photosById: Map<string, MediaAsset>): string => {
  const photos = day.media.map((id) => photosById.get(id)).filter((photo): photo is MediaAsset => Boolean(photo));
  return `
    <article class="day-card" id="day-${escapeHtml(day.id)}" data-day-id="${escapeHtml(day.id)}">
      <header class="day-card__header">
        <p class="day-card__eyebrow"><span>День ${day.dayNumber}</span><time datetime="${day.date}">${formatDayDate(day.date)}</time></p>
        <h2>${escapeHtml(day.title)}</h2>
        <p class="day-card__summary">${escapeHtml(day.summary)}</p>
      </header>
      ${day.locations.length ? `<ul class="location-list" aria-label="Локации этого дня">${day.locations.map((location) => `
        <li><span aria-hidden="true"></span>${escapeHtml(location.name)}${location.accuracy === "approximate" ? `<small>примерно</small>` : ""}</li>`).join("")}</ul>` : ""}
      <div class="day-card__text">${day.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
      ${photos.length ? `<div class="gallery gallery--${Math.min(photos.length, 4)}">${photos.map(photoMarkup).join("")}</div>` : ""}
      <button class="share-day" type="button" data-share-day="${escapeHtml(day.id)}">Скопировать ссылку на этот день</button>
    </article>`;
};

const renderAwaitingExport = (): string => `
  <section class="empty-state">
    <p class="empty-state__eyebrow">29 июля — 17 августа 2026</p>
    <h1>История уже в пути</h1>
    <p>Здесь появятся ежедневные отчёты, фотографии и проверенный маршрут путешествия детей по Волге.</p>
    <div class="empty-state__line" aria-hidden="true"><i></i><i></i><i></i></div>
    <p class="empty-state__note">Материалы Telegram ещё не импортированы.</p>
  </section>`;

async function start(): Promise<void> {
  const [manifestResponse, routeResponse] = await Promise.all([
    fetch("./data/media-manifest.json"),
    fetch("./data/route.geojson"),
  ]);
  if (!manifestResponse.ok || !routeResponse.ok) throw new Error("Не удалось загрузить данные путешествия");
  const manifest = await manifestResponse.json() as MediaManifest;
  const route = await routeResponse.json() as RouteCollection;
  const photosById = new Map(manifest.media.map((photo) => [photo.id, photo]));

  app.innerHTML = `
    <div class="site-shell">
      <section class="map-pane" aria-label="Карта путешествия">
        <div id="map"></div>
        <div id="map-fallback" class="map-fallback">
          <div class="map-fallback__river" aria-hidden="true"></div>
          <svg viewBox="0 0 1000 700" role="img" aria-label="Схема маршрута"></svg>
        </div>
        <div class="map-shade"></div>
        <a class="brand" href="./" aria-label="В начало истории"><i aria-hidden="true"></i><span><b>Дети</b><small>на Волге</small></span></a>
        <div class="map-legend" aria-label="Обозначения маршрута">
          <span><i class="is-water"></i>По воде</span><span><i class="is-road"></i>По дороге</span><span><i class="is-walk"></i>Пешком</span>
        </div>
        <p id="map-message" class="map-message" hidden></p>
      </section>
      <section class="story-pane">
        <header class="story-header">
          <p class="story-header__eyebrow">Большая река · лето 2026</p>
          <h1>${escapeHtml(trip.title)}</h1>
          <p>${escapeHtml(trip.subtitle)}</p>
          <time>${escapeHtml(trip.dates)}</time>
          ${trip.routeNote ? `<p class="story-header__note">${escapeHtml(trip.routeNote)}</p>` : ""}
        </header>
        ${days.length ? `
          <nav class="day-nav" aria-label="Дни путешествия">
            ${days.map((day) => `<button type="button" data-day-link="${escapeHtml(day.id)}"><span>${day.dayNumber}</span><small>${formatDayDate(day.date)}</small></button>`).join("")}
          </nav>
          <main class="journey-feed">${days.map((day) => dayMarkup(day, photosById)).join("")}</main>
          <footer class="story-footer"><span aria-hidden="true">≈</span><p>До новых встреч, Волга</p></footer>
        ` : renderAwaitingExport()}
      </section>
    </div>
    <div class="toast" role="status" aria-live="polite"></div>
    <dialog class="lightbox"><button type="button" data-close-lightbox aria-label="Закрыть">×</button><img alt="" /><p></p></dialog>`;

  const mapElement = document.querySelector<HTMLElement>("#map")!;
  const fallbackElement = document.querySelector<HTMLElement>("#map-fallback")!;
  const messageElement = document.querySelector<HTMLElement>("#map-message")!;
  const cards = [...document.querySelectorAll<HTMLElement>(".day-card")];
  const navButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-day-link]")];
  const toast = document.querySelector<HTMLElement>(".toast")!;
  const dialog = document.querySelector<HTMLDialogElement>(".lightbox")!;
  const dialogImage = dialog.querySelector<HTMLImageElement>("img")!;
  const dialogCaption = dialog.querySelector<HTMLParagraphElement>("p")!;
  let activeIndex = -1;

  const scrollToDay = (dayId: string, behavior: ScrollBehavior = "smooth"): void => {
    document.querySelector<HTMLElement>(`[data-day-id="${CSS.escape(dayId)}"]`)?.scrollIntoView({ behavior, block: "start" });
  };
  const journeyMap = new JourneyMap(trip, days, route, mapElement, fallbackElement, messageElement, (dayId) => {
    const url = new URL(window.location.href);
    url.searchParams.set(DAY_QUERY_KEY, dayId);
    history.pushState({ dayId }, "", url);
    scrollToDay(dayId);
  });

  const setActiveDay = (index: number): void => {
    if (index < 0 || index >= days.length || activeIndex === index) return;
    activeIndex = index;
    const day = days[index]!;
    cards.forEach((card, cardIndex) => card.classList.toggle("is-active", cardIndex === index));
    navButtons.forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    journeyMap.selectDay(day.id);
    document.title = `${day.title} — ${trip.title}`;
    const url = new URL(window.location.href);
    url.searchParams.set(DAY_QUERY_KEY, day.id);
    history.replaceState({ dayId: day.id }, "", url);
  };

  const showToast = (message: string): void => {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  };

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const dayLink = target.closest<HTMLElement>("[data-day-link]");
    const share = target.closest<HTMLElement>("[data-share-day]");
    const lightbox = target.closest<HTMLElement>("[data-lightbox]");
    if (dayLink?.dataset.dayLink) {
      const url = new URL(window.location.href);
      url.searchParams.set(DAY_QUERY_KEY, dayLink.dataset.dayLink);
      history.pushState({ dayId: dayLink.dataset.dayLink }, "", url);
      scrollToDay(dayLink.dataset.dayLink);
    }
    if (share?.dataset.shareDay) {
      const url = new URL(window.location.href);
      url.searchParams.set(DAY_QUERY_KEY, share.dataset.shareDay);
      void navigator.clipboard.writeText(url.toString()).then(() => showToast("Ссылка скопирована"), () => window.prompt("Скопируйте ссылку", url.toString()));
    }
    if (lightbox?.dataset.lightbox) {
      const photo = photosById.get(lightbox.dataset.lightbox);
      if (!photo) return;
      dialogImage.src = photo.src;
      dialogImage.alt = photo.alt;
      dialogCaption.textContent = photo.caption;
      dialog.showModal();
    }
    if (target.closest("[data-close-lightbox]")) dialog.close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  if (cards.length) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) return;
      const index = cards.indexOf(visible.target as HTMLElement);
      setActiveDay(index);
    }, { rootMargin: "-22% 0px -48% 0px", threshold: [0.1, 0.35, 0.65] });
    cards.forEach((card) => observer.observe(card));
    const initialIndex = dayIndexFromQuery(days, new URLSearchParams(window.location.search).get(DAY_QUERY_KEY));
    setActiveDay(initialIndex);
    if (initialIndex > 0) window.setTimeout(() => scrollToDay(days[initialIndex]!.id, "auto"), 0);
  }
  window.addEventListener("popstate", () => {
    const index = dayIndexFromQuery(days, new URLSearchParams(window.location.search).get(DAY_QUERY_KEY));
    if (index >= 0) scrollToDay(days[index]!.id, "auto");
  });

  await journeyMap.initialize();
  if (activeIndex >= 0) journeyMap.selectDay(days[activeIndex]!.id);
  loading?.classList.add("is-hidden");
}

start().catch((error) => {
  console.error(error);
  if (loading) loading.innerHTML = "<p>Не удалось открыть дневник. Проверьте файлы проекта.</p>";
});
