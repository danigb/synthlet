"use client";

import { useState } from "react";

export function ExamplePane({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return open ? (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="flex">
        <div className="text-xl mb-4 flex-grow">{label} example</div>
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
    <button
      className="border px-2 py-1 rounded bg-fd-secondary"
      onClick={() => {
        setOpen(true);
      }}
    >
      Open example
    </button>
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
  return (
    <div className="flex mb-4">
      <button
        className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground"
        onMouseDown={() => {
          gate.value = 1;
        }}
        onMouseUp={() => {
          gate.value = 0;
        }}
      >
        Gate
      </button>
    </div>
  );
}
