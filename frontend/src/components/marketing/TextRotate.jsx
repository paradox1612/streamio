import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function TextRotate({
  words,
  interval = 2400,
  className = '',
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!words?.length || words.length < 2) return undefined;
    const id = window.setInterval(() => {
      setIndex((value) => (value + 1) % words.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [interval, words]);

  if (!words?.length) return null;

  return (
    <span className={`relative inline-flex min-w-[8ch] items-center ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -18, filter: 'blur(10px)' }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
