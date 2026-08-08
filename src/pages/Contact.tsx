import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

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
          <strong>WhatsApp / Phone:</strong> +91 90000 00000
        </li>
        <li>
          <strong>Email:</strong> support@greenvest.demo
        </li>
        <li>
          <strong>{lang === 'bn' ? 'সময়' : 'Hours'}:</strong> 7:00 AM – 8:00 PM
        </li>
      </ul>
      <Link to="/" className="btn btn-secondary">
        {lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}
      </Link>
    </div>
  )
}
