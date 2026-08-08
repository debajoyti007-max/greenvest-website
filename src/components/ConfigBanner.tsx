import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

/** Soft tip only — local demo works without Supabase. */
export default function ConfigBanner() {
  const { mode } = useAuth()
  const { lang } = useStore()
  if (mode === 'cloud') return null

  return (
    <div className="config-banner soft" role="status">
      <span>
        {lang === 'bn'
          ? 'এখন লোকাল ডেমো চলছে (এই ডিভাইসে)। ফোন–ফোন শেয়ারের জন্য পরে Supabase keys দিন।'
          : 'Running on this device (local demo). For phone↔phone shared orders later, add Supabase keys.'}
      </span>
    </div>
  )
}
