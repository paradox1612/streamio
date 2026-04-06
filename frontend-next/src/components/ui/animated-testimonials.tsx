'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Testimonial {
  src: string
  name: string
  designation: string
  quote: string
  metric: string
  context: string
}

export function AnimatedTestimonials({
  testimonials,
  autoplay = false,
  className,
}: {
  testimonials: Testimonial[]
  autoplay?: boolean
  className?: string
}) {
  const [active, setActive] = useState(0)
  const activeTestimonial = testimonials?.[active]

  if (!testimonials?.length) return null

  const handleNext = () => setActive((prev) => (prev + 1) % testimonials.length)
  const handlePrev = () => setActive((prev) => (prev - 1 + testimonials.length) % testimonials.length)
  const isActive = (index: number) => index === active
  const randomRotateY = () => Math.floor(Math.random() * 21) - 10

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!autoplay) return
    const interval = setInterval(handleNext, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay])

  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 py-12 md:px-8 lg:px-12 lg:py-16', className)}>
      <div className="relative grid grid-cols-1 gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
        <div>
          <div className="relative h-[22rem] w-full">
            <AnimatePresence>
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={testimonial.src}
                  initial={{ opacity: 0, scale: 0.9, z: -100, rotate: randomRotateY() }}
                  animate={{
                    opacity: isActive(index) ? 1 : 0.7,
                    scale: isActive(index) ? 1 : 0.95,
                    z: isActive(index) ? 0 : -100,
                    rotate: isActive(index) ? 0 : randomRotateY(),
                    zIndex: isActive(index) ? 999 : testimonials.length + 2 - index,
                    y: isActive(index) ? [0, -80, 0] : 0,
                  }}
                  exit={{ opacity: 0, scale: 0.9, z: 100, rotate: randomRotateY() }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  className="absolute inset-0 origin-bottom overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_28px_80px_rgba(0,0,0,0.35)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={testimonial.src}
                    alt={testimonial.name}
                    draggable={false}
                    className="h-full w-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/55">{testimonial.metric}</p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-slate-200/78">{testimonial.context}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col justify-between py-2">
          <motion.div
            key={active}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <p className="eyebrow mb-4">Operator feedback</p>
            <h3 className="text-3xl font-bold text-white">{activeTestimonial.name}</h3>
            <p className="mt-2 text-sm text-slate-300/62">{activeTestimonial.designation}</p>
            <motion.p className="mt-8 text-lg leading-8 text-slate-200/82 sm:text-xl">
              {activeTestimonial.quote.split(' ').map((word, index) => (
                <motion.span
                  key={index}
                  initial={{ filter: 'blur(10px)', opacity: 0, y: 5 }}
                  animate={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut', delay: 0.02 * index }}
                  className="inline-block"
                >
                  {word}&nbsp;
                </motion.span>
              ))}
            </motion.p>
          </motion.div>

          <div className="flex items-center justify-between gap-4 pt-10 md:pt-6">
            <div className="text-sm text-slate-300/55">
              <span className="text-brand-200">{String(active + 1).padStart(2, '0')}</span>
              {' / '}
              {String(testimonials.length).padStart(2, '0')}
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handlePrev}
                className="group/button flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08]"
                aria-label="Previous testimonial"
              >
                <ChevronLeft className="h-5 w-5 transition-transform duration-300 group-hover/button:rotate-12" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="group/button flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08]"
                aria-label="Next testimonial"
              >
                <ChevronRight className="h-5 w-5 transition-transform duration-300 group-hover/button:-rotate-12" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
