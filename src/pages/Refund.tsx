import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { SUPPORT_PHONE } from '../lib/business'

export default function Refund() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'রিফান্ড নীতি' : 'Refund policy'}</h1>
      <p>
        {lang === 'bn'
          ? 'সেলার পেমেন্ট যাচাই করার আগে অর্ডার বাতিল হলে অগ্রিম ফেরত দেওয়া যায়। প্যাকেজিং ও রওনা হওয়ার পর রিফান্ড সেলারের অনুমোদনে প্রযোজ্য।'
          : 'If an order is cancelled before payment verification, the advance can be refunded. After verification and packing, refunds require seller approval.'}
      </p>
      <p>
        {lang === 'bn'
          ? `নষ্ট বা ভুল আইটেম পেলে ডেলিভারির দিনে ${SUPPORT_PHONE}-এ যোগাযোগ করুন। যেকোনো রিফান্ড সরাসরি আপনার UPI অ্যাকাউন্টে ফেরত পাঠানো হয়।`
          : `Contact us the same day at ${SUPPORT_PHONE} for spoiled or wrong items. Refunds are sent directly to your UPI account.`}
      </p>
      <Link to="/contact" className="btn btn-primary">
        {lang === 'bn' ? 'যোগাযোগ' : 'Contact us'}
      </Link>
    </div>
  )
}
