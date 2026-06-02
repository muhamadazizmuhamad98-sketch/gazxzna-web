import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: "1.5rem",
            maxWidth: 640,
            margin: "2rem auto",
            fontFamily: "system-ui, sans-serif",
            background: "#1e293b",
            color: "#f1f5f9",
            borderRadius: 12,
            border: "1px solid #475569",
          }}
        >
          <h1 style={{ fontSize: "1.1rem", marginTop: 0 }}>هەڵەی بەرنامە</h1>
          <p style={{ color: "#fca5a5", wordBreak: "break-word" }}>{String(this.state.error?.message || this.state.error)}</p>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            کۆنسۆڵی وێبگەڕ بکەرەوە (F12 → Console) و پەڕەکە نوێ بکەرەوە (Ctrl+Shift+R).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
