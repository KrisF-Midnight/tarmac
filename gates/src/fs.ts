import { stat } from "node:fs/promises";
import type { PathExists } from "./types";

/**
 * The one place the platform touches the filesystem to decide something.
 *
 * A missing path and an unreadable one are the same answer here — "there is
 * nothing I can check" — because the caller's next move is identical either
 * way, and a permissions error dressed up as a policy failure would send
 * somebody looking in the wrong place.
 */
export const statExists: PathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};
