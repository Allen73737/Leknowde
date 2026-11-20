"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/** The server cannot know the preference, so hydration always assumes motion. */
function getServerSnapshot() {
  return false;
}

/**
 * Hydration-safe reduced-motion preference.
 *
 * framer-motion's `useReducedMotion` reads `matchMedia` during the very first
 * client render. The server can only assume "no preference", so a visitor
 * whose OS asks for reduced motion hydrates different markup (React #418).
 * `useSyncExternalStore` hydrates from the server snapshot and then re-renders
 * with the real preference, so markup stays consistent and motion still stops.
 */
export function useReducedMotionSafe() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
