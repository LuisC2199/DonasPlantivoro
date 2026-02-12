import React from "react";

type Props = {
  open: boolean;
  message: string;
  variant?: "success" | "error";
  onClose: () => void;
};

export default function Toast({ open, message, variant = "success", onClose }: Props) {
  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, 2200);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]">
      <div
        className={`px-5 py-3 rounded-2xl shadow-2xl border font-black text-sm flex items-center gap-2 ${
          variant === "success"
            ? "bg-[#28CD7E] text-white border-[#28CD7E]/60"
            : "bg-red-600 text-white border-red-500"
        }`}
      >
        <span>{variant === "success" ? "✅" : "⚠️"}</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
