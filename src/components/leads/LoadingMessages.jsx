import { useState, useEffect } from 'react';

const MESSAGES = [
  "Hang tight!",
  "Sorting through 35,000+ premium leads...",
  "Worth the wait for the quality of Yesterday's Leads."
];

export default function LoadingMessages() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (index >= MESSAGES.length - 1) return;
    const cycle = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => i + 1);
        setVisible(true);
      }, 400);
    }, 3000);
    return () => clearTimeout(cycle);
  }, [index]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p
        className="text-lg font-medium text-slate-700 text-center max-w-lg whitespace-nowrap transition-opacity duration-400"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {MESSAGES[index]}
      </p>
    </div>
  );
}