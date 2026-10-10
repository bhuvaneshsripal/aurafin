/** Renders a formatted amount with the decimal part (".55") smaller, like a banking app. */
export default function SplitAmount({ text, decimalClassName = 'text-[0.62em] font-semibold' }: { text: string; decimalClassName?: string }) {
  const m = /^(.*\d)(\.\d+)(\D*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span className={decimalClassName}>{m[2]}</span>
      {m[3]}
    </>
  );
}
