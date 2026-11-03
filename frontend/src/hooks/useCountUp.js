import { useState, useEffect, useRef } from "react";

/**
 * Smoothly animates numeric counters using cubic ease-out:
 * eased = 1 - Math.pow(1 - progress, 3) over 900ms duration.
 */
export function useCountUp(targetValue, duration = 900) {
  const [displayValue, setDisplayValue] = useState(
    typeof targetValue === "number" ? targetValue : 0
  );
  const startValRef = useRef(displayValue);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const numTarget = typeof targetValue === "number" ? targetValue : parseFloat(targetValue);
    if (isNaN(numTarget)) {
      setDisplayValue(targetValue);
      return;
    }

    const startVal = startValRef.current || 0;
    startTimeRef.current = null;

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (numTarget - startVal) * eased;
      const rounded = Math.round(current);

      setDisplayValue(rounded);
      startValRef.current = rounded;

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(numTarget);
        startValRef.current = numTarget;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetValue, duration]);

  return displayValue;
}
