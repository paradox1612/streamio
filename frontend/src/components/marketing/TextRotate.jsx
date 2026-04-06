import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function TextRotate({
  words,
  interval = 2400,
  className = '',
}) {
  const [index, setIndex] = useState(0);
  const longestWord = words?.reduce((longest, current) => (
    current.length > longest.length ? current : longest
  ), words?.[0] ?? '');

  useEffect(() => {
    if (!words?.length || words.length < 2) return undefined;
    const id = window.setInterval(() => {
      setIndex((value) => (value + 1) % words.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [interval, words]);

  if (!words?.length) return null;

  return (
    <span className={`relative inline-grid min-w-[8ch] whitespace-nowrap ${className}`}>
      <span className="pointer-events-none col-start-1 row-start-1 invisible">
        {longestWord}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -18, filter: 'blur(10px)' }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="col-start-1 row-start-1 inline-block"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
