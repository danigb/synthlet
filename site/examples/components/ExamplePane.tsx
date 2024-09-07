"use client";

import { useState } from "react";

export function ExamplePane({
  label,
  header,
  children,
}: {
  label: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return open ? (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="flex">
        <div className="text-xl mb-4 flex-grow">{label} example</div>
        {header}
        <button
          className="border px-2 py-1 rounded bg-fd-secondary"
          onClick={() => {
            setOpen(false);
          }}
        >
          Close
        </button>
      </div>
      {children}
    </div>
  ) : (
    <div className="flex items-center gap-4">
      <button
        className="border px-2 py-1 rounded bg-fd-secondary text-nowrap"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open example
      </button>
    </div>
  );
}

export function ModulePane({
  label,
  children,
  paneClassName,
}: {
  label: string;
  children: React.ReactNode;
  paneClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="bold mt-4 border-b mb-1">
        <button
          onClick={() => {
            setOpen(!open);
          }}
        >
          {label}
          <span className="text-xs ml-2">{open ? "▼" : "▶"}</span>
        </button>
      </div>
      {open && <div className={paneClassName}>{children}</div>}
    </>
  );
}

export function TriggerButton({ trigger }: { trigger: { value: number } }) {
  return (
    <div className="flex mb-4">
      <button
        className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground"
        onMouseDown={() => {
          trigger.value = 1;
        }}
        onMouseUp={() => {
          trigger.value = 0;
        }}
      >
        Trigger
      </button>
    </div>
  );
}

export function GateButton({ gate }: { gate: { value: number } }) {
  const [sustain, setSustain] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <button
        className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground"
        onMouseDown={() => {
          const nextValue = sustain ? !open : true;
          setOpen(nextValue);
          gate.value = nextValue ? 1 : 0;
        }}
        onMouseUp={() => {
          if (sustain) return;
          setOpen(false);
          gate.value = 0;
        }}
      >
        Gate
      </button>
      <label>
        <input
          className="mr-1"
          type="checkbox"
          checked={sustain}
          onChange={() => {
            setSustain(!sustain);
          }}
        />
        Sustain
      </label>
    </div>
  );
}
