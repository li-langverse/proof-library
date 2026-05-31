import Link from "next/link";
import { PROOF_ATTRIBUTION } from "@/lib/attribution";

/** Rendered on every Proof Explorer page (WP0 / WP5). */
export function SiteFooter() {
  const { projectName, projectUrl, curatorName, curatorUrl, curatorX } = PROOF_ATTRIBUTION;
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-inner">
        <p className="site-footer-line">
          <Link href="/">{projectName}</Link>
          {" · "}
          Curated by{" "}
          <a href={curatorUrl} target="_blank" rel="noopener noreferrer">
            {curatorName}
          </a>{" "}
          (
          <a href={curatorX} target="_blank" rel="noopener noreferrer">
            @capjmk
          </a>
          )
        </p>
        <p className="site-footer-meta mono">
          <a href={projectUrl} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          {" · "}
          <a href="https://github.com/li-langverse/lic/tree/main/proof-db" target="_blank" rel="noopener noreferrer">
            lic/proof-db
          </a>
        </p>
      </div>
    </footer>
  );
}
