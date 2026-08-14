import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { SUPPORT_PHONE } from '../lib/business'

export default function Privacy() {
  const { lang } = useStore()

  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'গোপনীয়তা ও নীতিমালা' : 'Privacy & Policy'}</h1>

      {/* ── Privacy Policy ── */}
      <section className="legal-section">
        <h2>{lang === 'bn' ? '🔒 গোপনীয়তা নীতি' : '🔒 Privacy Policy'}</h2>
        <p>
          {lang === 'bn'
            ? 'GreenVest আপনার নাম, ইমেইল, ফোন ও ডেলিভারি ঠিকানা শুধুমাত্র অর্ডার পূরণ ও কাস্টমার সাপোর্টের জন্য সংগ্রহ করে। আপনার তথ্য তৃতীয় পক্ষের কাছে বিক্রি করা হয় না।'
            : 'GreenVest collects your name, email, phone and delivery address solely to fulfill orders and provide customer support. Your data is never sold to third parties.'}
        </p>
        <p>
          {lang === 'bn'
            ? 'অর্ডার ডেটা একটি সুরক্ষিত ক্লাউড ডাটাবেসে (Supabase) সংরক্ষিত হয়। কার্ট ও ভাষা পছন্দ আপনার ডিভাইসে সংরক্ষিত থাকতে পারে।'
            : 'Order data is stored in a secured cloud database (Supabase). Your cart and language preference may be stored locally on your device.'}
        </p>
        <p>
          {lang === 'bn'
            ? 'আপনার UPI/UTR তথ্য কখনো স্বয়ংক্রিয়ভাবে প্রক্রিয়া করা হয় না — সেলার ম্যানুয়ালি যাচাই করেন।'
            : 'Your UPI/UTR details are never processed automatically — the seller verifies them manually.'}
        </p>
      </section>

      {/* ── Refund Policy ── */}
      <section className="legal-section">
        <h2>{lang === 'bn' ? '💸 রিফান্ড নীতি' : '💸 Refund Policy'}</h2>
        <ul className="legal-list">
          <li>
            {lang === 'bn'
              ? 'UTR যাচাইয়ের আগে অর্ডার বাতিল হলে অগ্রিম পেমেন্ট ফেরত পাওয়া যাবে।'
              : 'If an order is cancelled before UTR verification, the advance payment can be refunded.'}
          </li>
          <li>
            {lang === 'bn'
              ? 'যাচাইয়ের পরে রিফান্ডের জন্য সেলারের অনুমোদন প্রয়োজন।'
              : 'After verification, refunds require seller approval.'}
          </li>
          <li>
            {lang === 'bn'
              ? `নষ্ট বা ভুল পণ্যের ক্ষেত্রে একই দিনে ${SUPPORT_PHONE}-তে যোগাযোগ করুন।`
              : `For spoiled or wrong items, contact us the same day at ${SUPPORT_PHONE}.`}
          </li>
          <li>
            {lang === 'bn'
              ? 'UPI/UTR পেমেন্ট ম্যানুয়াল — কোনো স্বয়ংক্রিয় রিফান্ড গেটওয়ে নেই।'
              : 'UPI/UTR payment is manual — there is no automatic refund gateway.'}
          </li>
        </ul>
      </section>

      <Link to="/" className="btn btn-secondary">
        {lang === 'bn' ? '← দোকানে ফিরুন' : '← Back to shop'}
      </Link>
    </div>
  )
}
