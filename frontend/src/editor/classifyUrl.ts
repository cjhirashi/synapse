// H-025 PASO 2: clasificador de URLs (YouTube, imágenes, links)

export function parseYoutubeUrl(
  url: string
): { id: string; start: number | null } | null {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "https:") return null;
    if (parsedUrl.username || parsedUrl.password) return null;

    const host = parsedUrl.hostname;
    if (!host) return null;

    const isValidHost =
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be";

    if (!isValidHost) return null;

    const pathname = parsedUrl.pathname;
    let id: string | null = null;

    // /watch?v=ID or /watch
    if (pathname === "/watch") {
      id = parsedUrl.searchParams.get("v");
    }
    // /shorts/ID
    else if (pathname.startsWith("/shorts/")) {
      id = pathname.slice("/shorts/".length);
    }
    // /embed/ID
    else if (pathname.startsWith("/embed/")) {
      id = pathname.slice("/embed/".length);
    }
    // youtu.be/ID
    else if (host === "youtu.be" && pathname.startsWith("/")) {
      id = pathname.slice(1);
    }
    // /playlist or other
    else {
      return null;
    }

    if (!id || !isValidYoutubeId(id)) return null;

    const start = parseStartTime(parsedUrl);

    return { id, start };
  } catch {
    return null;
  }
}

export function parseYoutubeEmbedSrc(
  src: string
): { id: string; start: number | null } | null {
  try {
    const url = new URL(src);

    if (url.protocol !== "https:") return null;
    if (url.hostname !== "www.youtube-nocookie.com") return null;
    if (url.port) return null;

    const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/);
    if (!match) return null;

    const id = match[1];

    // Only allow start parameter, nothing else
    const params = new URLSearchParams(url.search);
    const allowedParams = new Set(["start"]);
    for (const [key] of params) {
      if (!allowedParams.has(key)) return null;
    }

    if (url.hash) return null;

    const startStr = params.get("start");
    const start = startStr ? parseInt(startStr, 10) : null;
    if (startStr && (isNaN(start!) || start! < 0)) return null;

    return { id, start };
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(id: string, start: number | null): string {
  const url = `https://www.youtube-nocookie.com/embed/${id}`;
  if (start && start > 0) {
    return `${url}?start=${start}`;
  }
  return url;
}

export function youtubeWatchUrl(id: string, start: number | null): string {
  const url = `https://www.youtube.com/watch?v=${id}`;
  if (start && start > 0) {
    return `${url}&t=${start}`;
  }
  return url;
}

export function classifyUrl(
  text: string
):
  | { kind: "youtube"; id: string; start: number | null }
  | { kind: "image"; url: string }
  | { kind: "link"; url: string } {
  const trimmed = text.trim();

  // Try YouTube
  const yt = parseYoutubeUrl(trimmed);
  if (yt) {
    return { kind: "youtube", id: yt.id, start: yt.start };
  }

  // Check if it's a single HTTPS URL without internal spaces
  if (
    trimmed.startsWith("https://") &&
    !trimmed.slice("https://".length).includes(" ")
  ) {
    try {
      const url = new URL(trimmed);
      const pathname = url.pathname.toLowerCase();

      // Check for image extensions
      if (
        pathname.endsWith(".png") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".jpeg") ||
        pathname.endsWith(".gif") ||
        pathname.endsWith(".webp")
      ) {
        return { kind: "image", url: trimmed };
      }

      // Generic link
      return { kind: "link", url: trimmed };
    } catch {
      return { kind: "link", url: trimmed };
    }
  }

  // Default: treat as link with text as-is
  return { kind: "link", url: trimmed };
}

function isValidYoutubeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

function parseStartTime(url: URL): number | null {
  // Try t= or start=
  const tParam = url.searchParams.get("t");
  const startParam = url.searchParams.get("start");
  const timeStr = tParam || startParam;

  if (!timeStr) return null;

  // Parse different formats
  if (/^\d+$/.test(timeStr)) {
    return parseInt(timeStr, 10);
  }

  if (/^\d+s$/.test(timeStr)) {
    return parseInt(timeStr.slice(0, -1), 10);
  }

  // Parse hms format: 1h2m3s
  const hmsMatch = timeStr.match(
    /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/
  );
  if (!hmsMatch) return null;

  const hours = hmsMatch[1] ? parseInt(hmsMatch[1], 10) : 0;
  const minutes = hmsMatch[2] ? parseInt(hmsMatch[2], 10) : 0;
  const seconds = hmsMatch[3] ? parseInt(hmsMatch[3], 10) : 0;

  return hours * 3600 + minutes * 60 + seconds;
}
