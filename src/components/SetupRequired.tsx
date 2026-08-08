import { SUPPORT_EMAIL, SUPPORT_PHONE } from '../lib/business'
import { isProductionMisconfigured } from '../lib/runtime'

/** Full-page block when production has no Supabase. */
export default function SetupRequired() {
  return (
    <div className="page narrow" style={{ paddingTop: '4rem', textAlign: 'center' }}>
      <h1 className="brand-hero compact">GreenVest</h1>
      <p className="lede">
        This storefront is not connected to the database yet. Please contact the owner.
      </p>
      <p>
        <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`}>{SUPPORT_PHONE}</a>
        <br />
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </div>
  )
}

export function shouldBlockApp() {
  return isProductionMisconfigured()
}
