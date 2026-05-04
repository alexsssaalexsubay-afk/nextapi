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
          <div className="w-full max-w-md text-center">
            <h2 className="mb-2 text-[16px] font-semibold text-nc-text">
              Something went wrong
            </h2>
            <p className="mb-6 text-[12px] text-nc-text-tertiary">
              The application encountered an unexpected error. Your settings and progress have been saved.
            </p>
            {this.state.error && (
              <pre className="mb-6 max-h-32 overflow-auto rounded-[var(--radius-md)] border border-nc-border bg-nc-surface p-3 text-left font-mono text-[10px] text-nc-text-ghost">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="rounded-[var(--radius-md)] bg-nc-accent px-6 py-2 text-[13px] font-semibold text-nc-bg hover:bg-nc-accent-hover"
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
