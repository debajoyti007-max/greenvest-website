import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'

export default function Terms() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'শর্তাবলী' : 'Terms of service'}</h1>
      <p>
        {lang === 'bn'
          ? `গ্রেড A/B/C দাম ও স্টক সেলার সেট করে। সর্বনিম্ন অর্ডার ৳${MIN_ORDER_AMOUNT}। অর্ডারের পর অগ্রিম UPI পেমেন্ট ও UTR জমা বাধ্যতামূলক।`
          : `Grade A/B/C prices and stock are set by the seller. Minimum order is ₹${MIN_ORDER_AMOUNT}. After ordering you must pay advance via UPI and submit the UTR.`}
      </p>
      <p>
        {lang === 'bn'
          ? `সেলার UTR যাচাই না করা পর্যন্ত ডেলিভারি নিশ্চিত নয়। সাধারণ ডেলিভারি সময় ${DELIVERY_WINDOW_BN}। ভুল ঠিকানা বা PIN-এ বিলম্ব হতে পারে।`
          : `Delivery is not confirmed until the seller verifies your UTR. Typical delivery window is ${DELIVERY_WINDOW}. Wrong address or PIN may delay delivery.`}
      </p>
      <Link to="/" className="btn btn-secondary">
        {lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}
      </Link>
    </div>
  )
}
