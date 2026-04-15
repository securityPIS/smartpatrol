import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppBootBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("App boot failed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070b19] text-cyan-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-[2rem] border border-cyan-800/50 bg-[#0b1229] p-6 text-center shadow-[0_0_30px_rgba(6,182,212,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-500">SmartPatrol</p>
            <h1 className="mt-3 text-2xl font-black text-white">Aplikasi Sedang Memuat Ulang</h1>
            <p className="mt-3 text-sm leading-relaxed text-cyan-200/75">
              Terjadi gangguan saat memuat tampilan awal. Silakan refresh sekali lagi. Jika masih berulang, console browser sekarang akan menampilkan error yang lebih jelas.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <AppBootBoundary>
    <App />
  </AppBootBoundary>,
);
