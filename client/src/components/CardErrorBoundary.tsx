import { Component, type ReactNode } from "react";

type EBState = { error: Error | null };

export class CardErrorBoundary extends Component<{ parlayId: number; children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ParlayCard #${this.props.parlayId}] crashed:`, error.message, info.componentStack);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-destructive">
            Card #{this.props.parlayId} crashed — {this.state.error.message}
          </p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {this.state.error.stack}
          </pre>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={this.reset}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
