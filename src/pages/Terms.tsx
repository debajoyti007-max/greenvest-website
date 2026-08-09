import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'

export default function Terms() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'শর্তাবলী' : 'Terms of service'}</h1>
      
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '1.2rem', lineHeight: '1.6' }}>
        <li>
          {lang === 'bn'
            ? 'অনলাইনে দেখানো সবজি সবসময় সরাসরি দোকানে উপস্থিত নাও থাকতে পারে, তবে আপনার অর্ডার অনুযায়ী আমরা সব তাজা সবজি প্রস্তুত ও সরবরাহ করব।'
            : 'The vegetables shown online may not always be available in the physical shop, but we can provide everything fresh according to your order.'}
        </li>
        <li>
          <strong>
            {lang === 'bn'
              ? '⏱️ ডেলিভারি ব্যক্তির কাছ থেকে সবজি পরীক্ষা ও গ্রহণ করার জন্য আপনার কাছে মাত্র ২ মিনিট সময় থাকবে।'
              : '⏱️ You will have only 2 minutes to check and receive the vegetables from the delivery person.'}
          </strong>
        </li>
        <li>
          {lang === 'bn'
            ? 'আমাদের নির্ধারিত ডেলিভারি এলাকার (PIN Zone) বাইরে আমরা ডেলিভারি প্রদান করতে পারি না।'
            : 'We cannot provide delivery outside our designated delivery area.'}
        </li>
        <li>
          {lang === 'bn'
            ? `গ্রেড A/B/C দাম ও স্টক সেলার সেট করে। সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT}। অর্ডারের পর অগ্রিম UPI পেমেন্ট ও UTR জমা বাধ্যতামূলক।`
            : `Grade A/B/C prices and stock are set by the seller. Minimum order is ₹${MIN_ORDER_AMOUNT}. After ordering, 50% advance UPI payment and UTR submission are mandatory.`}
        </li>
        <li>
          {lang === 'bn'
            ? `সেলার UTR যাচাই করার পর অর্ডার কনফার্ম হয়। লোকাল ডেলিভারি সময় ৬–৮ ঘণ্টা (সাধারণ এলাকা ${DELIVERY_WINDOW_BN})।`
            : `Delivery is confirmed after seller verifies your UTR. Local delivery time is 6–8 hours (standard area ${DELIVERY_WINDOW}).`}
        </li>
      </ul>

      <div style={{ marginTop: '1.5rem' }}>
        <Link to="/" className="btn btn-secondary">
          {lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}
        </Link>
      </div>
    </div>
  )
}
