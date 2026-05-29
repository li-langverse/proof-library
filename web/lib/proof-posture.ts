import { existsSync, readFileSync } from "fs";
import path from "path";

export type ProofPostureRow = {
  id: string;
  status: string;
  phase: string;
};

export type ProofPosture = {
  generated_at: string;
  source: string;
  missing_source?: boolean;
  rows: ProofPostureRow[];
};

const POSTURE_PATH = path.join(process.cwd(), "..", "data", "posture.json");

export function loadProofPosture(): ProofPosture | null {
  if (!existsSync(POSTURE_PATH)) return null;
  return JSON.parse(readFileSync(POSTURE_PATH, "utf8")) as ProofPosture;
}
