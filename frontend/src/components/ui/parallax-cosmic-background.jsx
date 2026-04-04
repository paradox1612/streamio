import React from 'react';

const createStarField = (count, width, height, opacity) => Array.from({ length: count }, () => {
  const x = Math.floor(Math.random() * width);
  const y = Math.floor(Math.random() * height);
  const blur = Math.random() > 0.82 ? 6 : 0;
  const spread = Math.random() > 0.9 ? 1 : 0;

  return `${x}px ${y}px ${blur}px ${spread}px rgba(255,255,255,${opacity})`;
}).join(', ');

const starStyles = `
  @keyframes sb-cosmic-drift {
    0% {
      transform: translate3d(0, 0, 0) scale(1);
    }
    50% {
      transform: translate3d(0, -18px, 0) scale(1.02);
    }
    100% {
      transform: translate3d(0, -36px, 0) scale(1);
    }
  }

  @keyframes sb-cosmic-spin {
    0% {
      transform: rotate(0deg) scale(1);
    }
    50% {
      transform: rotate(7deg) scale(1.05);
    }
    100% {
      transform: rotate(0deg) scale(1);
    }
  }

  @keyframes sb-cosmic-pulse {
    0%, 100% {
      opacity: 0.42;
      transform: scale(0.96);
    }
    50% {
      opacity: 0.72;
      transform: scale(1.06);
    }
  }
`;

function StarLayer({
  size,
  shadow,
  duration,
  opacity,
  style,
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
      style={{ opacity, ...style }}
    >
      <div
        className="absolute left-0 top-0 rounded-full"
        style={{
          width: size,
          height: size,
          background: 'transparent',
          boxShadow: shadow,
          animation: `sb-cosmic-drift ${duration}s linear infinite`,
        }}
      />
      <div
        className="absolute left-0 top-[2000px] rounded-full"
        style={{
          width: size,
          height: size,
          background: 'transparent',
          boxShadow: shadow,
          animation: `sb-cosmic-drift ${duration}s linear infinite`,
        }}
      />
    </div>
  );
}

export default function ParallaxCosmicBackground({ children, className = '' }) {
  const [pointer, setPointer] = React.useState({ x: 0, y: 0 });
  const [smallStars] = React.useState(() => createStarField(180, 2000, 2000, 0.8));
  const [mediumStars] = React.useState(() => createStarField(90, 2000, 2000, 0.55));
  const [largeStars] = React.useState(() => createStarField(45, 2000, 2000, 0.4));

  React.useEffect(() => {
    let frameId = null;

    const handleMove = (event) => {
      if (frameId) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setPointer({
          x: ((event.clientX / window.innerWidth) - 0.5) * 2,
          y: ((event.clientY / window.innerHeight) - 0.5) * 2,
        });
      });
    };

    window.addEventListener('pointermove', handleMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handleMove);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <div
      className={`relative isolate overflow-hidden ${className}`}
      style={{
        background: `
          radial-gradient(circle at 50% -10%, rgba(95, 176, 255, 0.12), transparent 26%),
          radial-gradient(circle at 18% 22%, rgba(62, 159, 255, 0.16), transparent 20%),
          radial-gradient(circle at 82% 18%, rgba(19, 96, 202, 0.18), transparent 24%),
          linear-gradient(180deg, #030712 0%, #071325 34%, #08162a 62%, #050b15 100%)
        `,
      }}
    >
      <style>{starStyles}</style>

      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(82, 160, 255, 0.09) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(82, 160, 255, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.45) 20%, rgba(0,0,0,0.95) 100%)',
            transform: `translate3d(${pointer.x * -10}px, ${pointer.y * -6}px, 0)`,
            transition: 'transform 240ms ease-out',
          }}
        />

        <StarLayer
          size={1}
          shadow={smallStars}
          duration={120}
          opacity={0.7}
          style={{ transform: `translate3d(${pointer.x * -6}px, ${pointer.y * -8}px, 0)` }}
        />
        <StarLayer
          size={2}
          shadow={mediumStars}
          duration={180}
          opacity={0.5}
          style={{ transform: `translate3d(${pointer.x * -12}px, ${pointer.y * -10}px, 0)` }}
        />
        <StarLayer
          size={3}
          shadow={largeStars}
          duration={240}
          opacity={0.42}
          style={{ transform: `translate3d(${pointer.x * -18}px, ${pointer.y * -14}px, 0)` }}
        />

        <div
          className="absolute left-1/2 top-[11rem] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(74, 170, 255, 0.28) 0%, rgba(74, 170, 255, 0.1) 34%, transparent 72%)',
            filter: 'blur(44px)',
            animation: 'sb-cosmic-pulse 8s ease-in-out infinite',
            transform: `translate3d(calc(-50% + ${pointer.x * 14}px), ${pointer.y * 12}px, 0)`,
          }}
        />

        <div
          className="absolute left-[-12%] top-[22%] h-[24rem] w-[24rem] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(17, 109, 220, 0.22) 0%, rgba(17, 109, 220, 0.08) 38%, transparent 72%)',
            filter: 'blur(52px)',
            animation: 'sb-cosmic-spin 18s ease-in-out infinite',
            transform: `translate3d(${pointer.x * -16}px, ${pointer.y * -8}px, 0)`,
          }}
        />

        <div
          className="absolute right-[-10%] top-[12%] h-[28rem] w-[28rem] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(116, 202, 255, 0.16) 0%, rgba(116, 202, 255, 0.06) 42%, transparent 76%)',
            filter: 'blur(58px)',
            animation: 'sb-cosmic-spin 22s ease-in-out infinite',
            transform: `translate3d(${pointer.x * 18}px, ${pointer.y * -10}px, 0)`,
          }}
        />

        <div
          className="absolute inset-x-[-12%] bottom-[-18rem] h-[36rem] rounded-[50%]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(64, 174, 255, 0.5) 0%, rgba(35, 130, 220, 0.22) 18%, rgba(8, 22, 42, 0.92) 56%, rgba(3, 7, 18, 0) 70%)',
            filter: 'blur(6px)',
            transform: `translate3d(${pointer.x * 12}px, ${pointer.y * 8}px, 0)`,
            transition: 'transform 320ms ease-out',
          }}
        />

        <div
          className="absolute inset-x-[16%] bottom-[12rem] h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(163, 220, 255, 0.85), transparent)',
            boxShadow: '0 0 26px rgba(111, 195, 255, 0.65)',
            transform: `translate3d(${pointer.x * 10}px, ${pointer.y * 4}px, 0)`,
            transition: 'transform 260ms ease-out',
          }}
        />

        <div
          className="absolute inset-x-0 bottom-0 h-[38rem]"
          style={{
            background: 'linear-gradient(180deg, rgba(5, 11, 21, 0) 0%, rgba(5, 11, 21, 0.58) 35%, rgba(5, 11, 21, 0.96) 100%)',
          }}
        />
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  );
}
