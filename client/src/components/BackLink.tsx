import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

/** "← Admin"-style link back to a parent page, for pages reached from a menu
 * rather than the sidebar. Sits above the page title. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      data-testid="link-back"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      {label}
    </Link>
  );
}
