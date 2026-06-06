import { createContext, useContext, useState, type ReactNode } from 'react'
import en from '../i18n/en.json'
import yue from '../i18n/yue.json'

export type Locale = 'en' | 'yue'

const translations: Record<Locale, Record<string, string>> = { en, yue }

interface I18nContextType {
  locale: Locale
  t: (key: string) => string
  toggleLocale: () => void
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en')

  const t = (key: string): string => translations[locale][key] ?? key

  const toggleLocale = () => setLocale(prev => (prev === 'en' ? 'yue' : 'en'))

  return (
    <I18nContext.Provider value={{ locale, t, toggleLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
