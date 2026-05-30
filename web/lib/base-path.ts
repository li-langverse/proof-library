/** Site root on proofs.lilangverse.xyz; set NEXT_PUBLIC_BASE_PATH=/proof-library for github.io subpath. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) {
    return `${BASE_PATH}/${path}`;
  }
  return BASE_PATH ? `${BASE_PATH}${path}` : path;
}
