export function readPref(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable, the preference still applies for this session
  }
}

// The same guards for the page-to-page handoff. Storage throws outright in a browser set
// to block it and in some in-app webviews, which is a common way into a shared room link,
// so a handoff value has to be able to fail without taking the navigation with it. Every
// reader defaults to the value it would have had anyway.
export function readSessionPref(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionPref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // handoff unavailable, the reader falls back to its default
  }
}

export function removeSessionPref(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // nothing was stored to begin with
  }
}
