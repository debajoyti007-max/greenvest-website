import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

export default function Terms() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'শর্তাবলী' : 'Terms of service'}</h1>
      <p>
        {lang === 'bn'
          ? 'গ্রেড A/B/C দাম ও স্টক সেলার দ্বারা সেট হয়। অর্ডার দেওয়ার পর অগ্রিম UTR জমা দিতে হবে।'
          : 'Grade A/B/C prices and stock are set by the seller. After placing an order you must submit an advance UTR.'}
      </p>
      <p>
        {lang === 'bn'
          ? 'সেলার UTR যাচাই না করা পর্যন্ত ডেলিভারি নিশ্চিত নয়। ভুল ঠিকানা বা PIN-এর জন্য বিলম্ব হতে পারে।'
          : 'Delivery is not confirmed until the seller verifies your UTR. Wrong address or PIN may delay delivery.'}
      </p>
      <Link to="/" className="btn btn-secondary">
        {lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}
      </Link>
    </div>
  )
}
