import React from 'react';
import SeraProgressBar from './sera/SeraProgressBar';

/**
 * ProgressBar — now delegates to the Sera UI SeraProgressBar.
 * Keeps the same external API so existing callers don't break.
 */
export default function ProgressBar({ value, max = 100, color, label = null, showLabel = false }) {
  // Map old color class strings → Sera UI color tokens
  let seraColor = 'brand';
  if (color) {
    if (color.includes('emerald') || color.includes('green')) seraColor = 'emerald';
    else if (color.includes('amber') || color.includes('yellow')) seraColor = 'amber';
    else if (color.includes('red')) seraColor = 'red';
    else seraColor = 'brand';
  }

  return (
    <SeraProgressBar
      value={value}
      max={max}
      color={seraColor}
      label={label}
      showLabel={showLabel}
      size="md"
    />
  );
}
