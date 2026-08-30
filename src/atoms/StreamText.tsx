import { useEffect, useRef, useState } from "react";

export function StreamText({
  text,
  speed = 18,
  onProgress,
  onDone,
}: {
  text: string;
  speed?: number;
  onProgress?: () => void;
  onDone?: () => void;
}) {
  const [shown, setShown] = useState(0);
  const cbs = useRef({ onProgress, onDone });
  cbs.current = { onProgress, onDone };

  useEffect(() => {
    setShown(0);
  }, [text]);

  useEffect(() => {
    if (shown >= text.length) {
      cbs.current.onDone?.();
      return;
    }
    const id = window.setTimeout(() => {
      setShown((n) => Math.min(text.length, n + 1));
      cbs.current.onProgress?.();
    }, speed);
    return () => window.clearTimeout(id);
  }, [shown, text, speed]);

  return <>{text.slice(0, shown)}</>;
}

export default StreamText;
