"use client";

export default function CreationModeSwitch({
  bulk,
  disabled,
  onChange,
}: {
  bulk: boolean;
  disabled: boolean;
  onChange: (bulk: boolean) => void;
}) {
  return (
    <div role="group" aria-label="新增方式" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
      {[{ bulk: false, label: "单个新增" }, { bulk: true, label: "批量新增" }].map((mode) => (
        <button
          key={mode.label}
          type="button"
          aria-pressed={bulk === mode.bulk}
          disabled={disabled}
          onClick={() => onChange(mode.bulk)}
          className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 ${bulk === mode.bulk ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
