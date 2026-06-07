'use client'

import { useEffect, useState } from 'react'

export default function IntroOverlay() {
  const [phase, setPhase] = useState<'visible' | 'fading' | 'gone'>('visible')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), 3400)
    const t2 = setTimeout(() => setPhase('gone'), 4000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (phase === 'gone') return null

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6
        bg-canvas transition-opacity duration-500 pointer-events-none
        ${phase === 'fading' ? 'opacity-0' : 'opacity-100'}
      `}
    >
      <div className="absolute inset-0 bg-brand-mesh-soft" />

      <div className="relative flex flex-col items-center gap-4 text-center select-none">
        <div
          className="w-14 h-14 rounded-2xl shadow-card-lg"
          style={{ background: 'linear-gradient(135deg, #007cf0 0%, #00dfd8 50%, #ff0080 100%)' }}
        />
        <div className="flex flex-col items-center gap-1">
          <span className="display-lg tracking-tight">Metropo</span>
          <span className="eyebrow">Urban City Planner</span>
        </div>
        <p className="text-body text-[13px] max-w-[260px] leading-relaxed">
          Smart district analysis for Hong Kong —{' '}
          powered by real land-use data.
        </p>
      </div>
    </div>
  )
}
