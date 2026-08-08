import { SUPPORT_EMAIL, SUPPORT_HOURS, SUPPORT_PHONE } from '../lib/business'
import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { supportWhatsAppUrl } from '../lib/whatsapp'

export default function Contact() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'যোগাযোগ' : 'Contact'}</h1>
      <p className="lede">
        {lang === 'bn'
          ? 'অর্ডার বা ডেলিভারি সংক্রান্ত সাহায্যের জন্য যোগাযোগ করুন।'
          : 'Reach us for order or delivery help.'}
      </p>
      <ul className="legal-list">
        <li>
          <strong>WhatsApp / Phone:</strong>{' '}
          <a href={supportWhatsAppUrl()} target="_blank" rel="noreferrer">
            {SUPPORT_PHONE}
          </a>
        </li>
        <li>
          <strong>Email:</strong>{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </li>
        <li>
          <strong>{lang === 'bn' ? 'সময়' : 'Hours'}:</strong> {SUPPORT_HOURS}
        </li>
      </ul>
      <Link to="/" className="btn btn-secondary">
        {lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}
      </Link>
    </div>
  )
}
