import Link from "next/link";

export function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div>
          <h1>
            <Link href="/">Li Proof Library</Link>
          </h1>
          <p>Catalog vs Lean — scientific opinion, divergence, human votes</p>
        </div>
        <nav className="site-nav" aria-label="Site">
          <a
            href="https://github.com/li-langverse/proof-library"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://github.com/li-langverse/lic/blob/main/docs/verification/provability-gaps.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            G-* gaps
          </a>
          <a
            href="https://li-langverse.github.io/benchmarks/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Benchmarks
          </a>
        </nav>
      </div>
    </header>
  );
}
