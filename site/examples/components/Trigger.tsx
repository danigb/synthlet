export function Trigger({ trigger }: { trigger: { value: number } }) {
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
