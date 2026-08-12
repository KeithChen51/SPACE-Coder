const ROUTE_FIELDS = ["id", "path", "viewports"];
const VIEWPORT_FIELDS = ["height", "id", "width"];
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields must be exactly: ${wanted.join(", ")}.`);
  }
}

export function strictVisualBaseUrl(value, hasRoutes) {
  if (value === null && !hasRoutes) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    throw new Error("baseUrl is required when routes are configured.");
  }
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("baseUrl must be a valid HTTP(S) URL origin."); }
  if (!["http:", "https:"].includes(parsed.protocol)
    || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash
    || parsed.origin !== value.replace(/\/$/, "")) {
    throw new Error("baseUrl must be an exact HTTP(S) URL origin without credentials, path, query or fragment.");
  }
  return parsed.origin;
}

function strictRoutePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || !value.startsWith("/")
    || value.includes("\\") || value.includes("?") || value.includes("#") || /[\u0000-\u001f\u007f]/.test(value)
    || /%2f|%5c/i.test(value)) {
    throw new Error("Route path must be a safe absolute URL pathname.");
  }
  let decoded = value;
  for (let index = 0; index < 4; index += 1) {
    let next;
    try { next = decodeURIComponent(decoded); } catch { throw new Error("Route path contains invalid URL encoding."); }
    if (next === decoded) break;
    decoded = next;
  }
  if (decoded.includes("\\") || decoded.includes("?") || decoded.includes("#") || /[\u0000-\u001f\u007f]/.test(decoded)
    || decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Route path contains URL traversal.");
  }
  if (new URL(value, "http://route.invalid").pathname !== value) throw new Error("Route path must already be in canonical URL form.");
  return value;
}

function strictViewport(value, routeId) {
  exactKeys(value, VIEWPORT_FIELDS, `Viewport in route ${routeId}`);
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id) || value.id.length > 40) {
    throw new Error(`Viewport id in route ${routeId} is invalid.`);
  }
  if (!Number.isInteger(value.width) || value.width < 320 || value.width > 3840
    || !Number.isInteger(value.height) || value.height < 320 || value.height > 2160) {
    throw new Error(`Viewport ${value.id} in route ${routeId} has invalid dimensions.`);
  }
  if (value.id === "desktop" && value.width < 1024) throw new Error(`Desktop viewport in route ${routeId} must be at least 1024px wide.`);
  if (value.id === "mobile" && value.width > 768) throw new Error(`Mobile viewport in route ${routeId} must be at most 768px wide.`);
  return { id: value.id, width: value.width, height: value.height };
}

export function strictVisualRoutes(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("routes must be an array with at most 100 entries.");
  const routeIds = new Set();
  return value.map((route, routeIndex) => {
    exactKeys(route, ROUTE_FIELDS, `Route ${routeIndex}`);
    if (typeof route.id !== "string" || !ID_PATTERN.test(route.id) || route.id.length > 64) {
      throw new Error(`Route id at index ${routeIndex} is invalid.`);
    }
    const normalizedId = route.id.toLowerCase();
    if (routeIds.has(normalizedId)) throw new Error(`Duplicate route id: ${route.id}.`);
    routeIds.add(normalizedId);
    if (!Array.isArray(route.viewports) || route.viewports.length < 2 || route.viewports.length > 8) {
      throw new Error(`Route ${route.id} must declare desktop and mobile viewports.`);
    }
    const viewportIds = new Set();
    const viewports = route.viewports.map((viewport) => {
      const checked = strictViewport(viewport, route.id);
      if (viewportIds.has(checked.id)) throw new Error(`Duplicate viewport id ${checked.id} in route ${route.id}.`);
      viewportIds.add(checked.id);
      return checked;
    });
    if (!viewportIds.has("desktop") || !viewportIds.has("mobile")) {
      throw new Error(`Route ${route.id} must include desktop and mobile viewports.`);
    }
    return { id: route.id, path: strictRoutePath(route.path), viewports };
  });
}

export function validateVisualVerification(value) {
  exactKeys(value, ["baseUrl", "routes", "status"], "visualVerification");
  if (!["configured", "not-configured"].includes(value.status)) throw new Error("visualVerification.status is invalid.");
  const routes = strictVisualRoutes(value.routes);
  const baseUrl = strictVisualBaseUrl(value.baseUrl, routes.length > 0);
  if (value.status === "configured" && routes.length === 0) throw new Error("configured visual verification requires at least one route.");
  if (value.status === "not-configured" && (routes.length !== 0 || baseUrl !== null)) {
    throw new Error("not-configured visual verification requires baseUrl=null and no routes.");
  }
  return { status: value.status, baseUrl, routes };
}
