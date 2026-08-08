import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

export default function Refund() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'রিফান্ড নীতি' : 'Refund policy'}</h1>
      <p>
        {lang === 'bn'
          ? 'সেলার UTR যাচাই করার আগে অর্ডার বাতিল হলে অগ্রিম ফেরত দেওয়া যায়। যাচাইয়ের পর রিফান্ড সেলারের অনুমোদনে।'
          : 'If an order is cancelled before UTR verification, the advance can be refunded. After verification, refunds require seller approval.'}
      </p>
      <p>
        {lang === 'bn'
          ? 'নষ্ট বা ভুল আইটেম পেলে ডেলিভারির দিনে যোগাযোগ করুন। UTR পেমেন্ট ম্যানুয়াল — অটো রিফান্ড নেই।'
          : 'Contact us the same day for spoiled or wrong items. UTR payment is manual — there is no automatic refund gateway.'}
      </p>
      <Link to="/contact" className="btn btn-primary">
        {lang === 'bn' ? 'যোগাযোগ' : 'Contact us'}
      </Link>
    </div>
  )
}
