"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.fallbackLabel, error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[260px] flex-col items-start justify-center gap-3 rounded-xl border border-danger/40 bg-danger/5 p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-danger">
            <span className="inline-block h-2 w-2 rounded-full bg-danger" />
            {this.props.fallbackLabel ?? "Chart failed to render"}
          </div>
          <div className="text-xs text-fg-muted">
            {this.state.error.message || "Unknown error"}
          </div>
          <button
            onClick={this.reset}
            className="rounded-md border border-border bg-bg-card px-3 py-1 text-xs font-medium text-fg hover:bg-bg-hover"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
