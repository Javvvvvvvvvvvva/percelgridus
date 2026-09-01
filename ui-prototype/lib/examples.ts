/**
 * Example seed addresses for the search screen. These are NOT facts and carry no
 * parcel stats — each address resolves live through the real pipeline when
 * chosen. (There is no persisted "recent lookups" store yet; when there is, it
 * will show the actual snapshot each run captured, not hand-written numbers.)
 */

/** The address pre-filled in the search box — a real pilot parcel, as a starting point. */
export const DEFAULT_ADDRESS = "2320 Colfax Ave S, Minneapolis, MN 55405";

/** A few Minneapolis addresses to try. Shown as links only; no stats are asserted. */
export const EXAMPLE_ADDRESSES: readonly string[] = [
  "2320 Colfax Ave S, Minneapolis, MN 55405",
  "1416 W 28th St, Minneapolis, MN 55408",
  "3100 Lyndale Ave S, Minneapolis, MN 55408",
];
