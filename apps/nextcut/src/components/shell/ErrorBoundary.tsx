import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-nc-bg p-8">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-nc-border bg-nc-panel/50 p-8 text-center shadow-sm">
            <h2 className="mb-2 text-lg font-semibold text-nc-text">
              Something went wrong
            </h2>
            <p className="mb-6 text-sm text-nc-text-secondary">
              The application encountered an unexpected error. Your settings and progress have been saved.
            </p>
            {this.state.error && (
              <pre className="mb-6 max-h-32 overflow-auto rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-4 text-left font-mono text-xs text-nc-text-tertiary shadow-sm">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="rounded-[var(--radius-lg)] bg-nc-accent px-7 py-2.5 text-base font-semibold text-nc-bg shadow-md transition-all hover:bg-nc-accent-hover hover:shadow-lg"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
