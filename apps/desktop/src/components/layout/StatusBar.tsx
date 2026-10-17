import type { MouseEvent } from "react";
import { ArrowRight } from "lucide-react";

interface StatusBarProps {
  productName?: string;
  year?: number;
  statusText?: string;
  onOpenDocumentation?: () => void;
}

export default function StatusBar({
  productName = "Zero Studio",
  year = 2026,
  statusText = "All systems operational",
  onOpenDocumentation,
}: StatusBarProps) {
  const handleDocumentationClick = (
    event: MouseEvent<HTMLAnchorElement>,
  ) => {
    event.preventDefault();
    onOpenDocumentation?.();
  };

  return (
    <footer className="page-footer">
      <span>
        © {year} {productName}
      </span>

      <span>
        <span className="footer-dot" />
        {statusText}
      </span>

      <a
        href="#documentation"
        onClick={handleDocumentationClick}
      >
        Documentation
        <ArrowRight size={13} />
      </a>
    </footer>
  );
}