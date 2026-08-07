import { Component, type ReactNode } from "react";

type EBState = { error: Error | null };

export class RouteErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[Route] crashed:", error.message, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-4">
          <p className="text-sm font-semibold text-destructive">
            Something went wrong loading this page.
          </p>
          <p className="text-xs text-muted-foreground max-w-md">{this.state.error.message}</p>
          <a
            href="/"
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Go to Dashboard
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
