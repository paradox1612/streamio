'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function ThreeDMarquee({
  images,
  className,
}: {
  images: string[]
  className?: string
}) {
  const chunkSize = Math.ceil(images.length / 3)
  const chunks = Array.from({ length: 3 }, (_, colIndex) => {
    const start = colIndex * chunkSize
    return images.slice(start, start + chunkSize)
  })

  return (
    <div className={cn('mx-auto block h-[35rem] w-full overflow-hidden rounded-md', className)}>
      <div className="flex size-full items-center justify-center">
        <div className="aspect-square size-[45rem] shrink-0 scale-[1.35] max-xl:size-full max-xl:scale-110">
          <div
            style={{ transform: 'rotateX(45deg) rotateY(0deg) rotateZ(45deg)' }}
            className="relative right-[-55%] top-0 grid size-full origin-top-left grid-cols-3 gap-5 max-xl:-top-30 max-xl:right-[-45%]"
          >
            {chunks.map((subarray, colIndex) => (
              <motion.figure
                key={colIndex}
                animate={{ y: colIndex % 2 === 0 ? 60 : -60 }}
                transition={{
                  duration: colIndex % 2 === 0 ? 10 : 15,
                  repeat: Infinity,
                  repeatType: 'reverse',
                }}
                className="flex flex-col items-start gap-6"
              >
                {subarray.map((src, imageIndex) => (
                  <div className="relative" key={imageIndex}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="aspect-[4/3] h-full w-full rounded-lg bg-neutral-900 object-cover"
                      src={src}
                      draggable={false}
                      alt={`Preview ${imageIndex + 1}`}
                    />
                  </div>
                ))}
              </motion.figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
