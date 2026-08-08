import { SUPPORT_EMAIL, SUPPORT_PHONE } from '../lib/business'
import { isProductionMisconfigured } from '../lib/runtime'
import { useStore } from '../context/StoreContext'

/** Shown only when production build is missing Supabase env. */
export default function ConfigBanner() {
  const { lang } = useStore()
  if (!isProductionMisconfigured()) return null

  return (
    <div className="config-banner" role="alert">
      <strong>{lang === 'bn' ? 'সাইট কনফিগার হয়নি' : 'Store not configured'}</strong>
      <span>
        {lang === 'bn'
          ? `অর্ডার চালু করতে Supabase keys দরকার। সাহায্য: ${SUPPORT_PHONE} / ${SUPPORT_EMAIL}`
          : `Supabase keys are required for live orders. Help: ${SUPPORT_PHONE} / ${SUPPORT_EMAIL}`}
      </span>
    </div>
  )
}
