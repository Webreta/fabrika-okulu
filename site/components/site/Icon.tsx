// Küçük inline ikon seti — harici ikon kütüphanesine bağımlılık yok
const paths = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h14V10",
  book: "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm4 0v16",
  play: "M8 5v14l11-7z",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  check: "m5 12 5 5L20 7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3 2 1-1 3-2-.5a7 7 0 0 1-1.5 1.5l.5 2-3 1-1-2h-2l-1 2-3-1 .5-2A7 7 0 0 1 6 15.5L4 16l-1-3 2-1v-2l-2-1 1-3 2 .5A7 7 0 0 1 7.5 5L7 3l3-1 1 2h2l1-2 3 1-.5 2A7 7 0 0 1 18 6.5l2-.5 1 3-2 1z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm-4 0-1 7 5-3 5 3-1-7",
  cart: "M3 4h2l2 12h11l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  quiz: "M9 11h6M9 15h4M7 3h10v18H7zM12 7h.01",
  task: "M9 5h6M9 3h6v4H9zM5 5h2v16h10V5h2",
  video: "M3 7h13v10H3zM16 10l5-3v10l-5-3",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  megaphone: "M3 11v2l11 4V7zM14 8a4 4 0 0 1 0 8M5 13v5h3v-4",
  external: "M14 4h6v6M20 4l-9 9M19 14v6H5V6h6",
  logout: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9",
  menu: "M4 6h16M4 12h16M4 18h16",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3",
  edit: "m4 20 4-1L20 7l-3-3L5 16zM14 6l3 3",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 18l-6-6 6-6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  phone:
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  whatsapp:
    "M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zM9 8c.3 0 .5.5 1 1.5.2.5-.3.8-.5 1.1.5 1 1.5 2 2.6 2.5.3-.3.6-.8 1-.6L15 13c.4.3 0 1.6-1 1.8-1.5.2-4.5-1.6-5.5-4.5C8.2 9 8.5 8 9 8z",
  mapPin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 21h16",
  upload: "M12 21V9m0 0-4 4m4-4 4 4M4 3h16",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  message: "M4 4h16v12H8l-4 4z",
  survey: "M4 4h16v16H4zM8 9h8M8 13h5",
  library: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7c-2-4-6-4-6-1s4 1 6 1zm0 0c2-4 6-4 6-1s-4 1-6 1z",
  building: "M4 21V5l8-3v19M12 21V9l8 2v10M8 8h.01M8 12h.01M8 16h.01M16 14h.01M16 18h.01",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  alert: "M12 3 2 21h20zM12 10v4M12 17h.01",
  tag: "M3 12V3h9l9 9-9 9zM7 7h.01",
  save: "M4 4h12l4 4v12H4zM8 4v5h7M8 20v-6h8v6",
  copy: "M8 8h12v12H8zM4 16V4h12",
  volume: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  timer: "M10 2h4M12 8v5l3 2M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4v4h-4z",
  paint: "M12 3a9 9 0 0 0 0 18c1 0 1.5-.7 1.5-1.5 0-.5-.2-.9-.4-1.2-.3-.3-.6-.7-.6-1.3 0-1 .7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5zM7 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3-4a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6",
  pause: "M8 5h3v14H8zM13 5h3v14h-3z",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  chevronDown: "m6 9 6 6 6-6",
  chevronUp: "m6 15 6-6 6 6",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  linkedin: "M4 9h4v12H4zM6 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h4v2c1-1.5 2.5-2.5 4.5-2.5S22 10 22 14v7h-4v-6c0-2-1-3-2.5-3S13 13 13 15v6h-3z",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm5.5-1.5h.01",
  twitter: "M4 4l16 16M20 4 4 20",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
