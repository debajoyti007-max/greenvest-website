import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { SUPPORT_EMAIL } from '../lib/business'

export default function Privacy() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'গোপনীয়তা নীতি' : 'Privacy policy'}</h1>
      <p>
        {lang === 'bn'
          ? 'GreenVest আপনার নাম, ইমেইল, ফোন ও ডেলিভারি ঠিকানা অর্ডার পূরণ ও কাস্টমার সাপোর্টের জন্য সংগ্রহ করে। অর্ডার ডেটা সুরক্ষিত ক্লাউড ডাটাবেসে (Supabase) সংরক্ষিত হয়। কার্ট ও ভাষা পছন্দ আপনার ডিভাইসে থাকতে পারে।'
          : 'GreenVest collects your name, email, phone, and delivery address to fulfill orders and provide support. Order data is stored in a secured cloud database (Supabase). Your cart and language preference may stay on your device.'}
      </p>
      <p>
        {lang === 'bn'
          ? `আমরা আপনার UTR তৃতীয় পক্ষের সাথে বিক্রি করি না; সেলার ম্যানুয়ালি যাচাই করে। প্রশ্ন: ${SUPPORT_EMAIL}`
          : `We do not sell your UTR to third parties; sellers verify it manually. Questions: ${SUPPORT_EMAIL}`}
      </p>
      <Link to="/" className="btn btn-secondary">
        {lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}
      </Link>
    </div>
  )
}
