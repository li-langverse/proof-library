import { existsSync, readFileSync } from "fs";
import path from "path";
import type { ProofLibrary } from "./proof-library-types";

export type { ProofLibrary, ProofLibraryEntry, ProofVoteOption } from "./proof-library-types";
export {
  VOTE_LABELS,
  LIBRARY_PUBLIC_URL,
  proofStatusBadgeClass,
} from "./proof-library-types";

const LIB_PATH = path.join(process.cwd(), "..", "data", "library.json");

export function loadLibrary(): ProofLibrary | null {
  if (!existsSync(LIB_PATH)) return null;
  return JSON.parse(readFileSync(LIB_PATH, "utf8")) as ProofLibrary;
}
