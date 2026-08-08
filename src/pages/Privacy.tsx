import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

export default function Privacy() {
  const { lang } = useStore()
  return (
    <div className="page narrow legal-page">
      <h1>{lang === 'bn' ? 'গোপনীয়তা নীতি' : 'Privacy policy'}</h1>
      <p>
        {lang === 'bn'
          ? 'GreenVest আপনার নাম, ইমেইল, ফোন ও ডেলিভারি ঠিকানা শুধুমাত্র অর্ডার পূরণের জন্য ব্যবহার করে। এই ডেমো অ্যাপে ডেটা আপনার ব্রাউজারের localStorage-এ থাকে।'
          : 'GreenVest uses your name, email, phone, and delivery address only to fulfill orders. In this demo app, data stays in your browser localStorage.'}
      </p>
      <p>
        {lang === 'bn'
          ? 'আমরা তৃতীয় পক্ষের সাথে আপনার পেমেন্ট UTR শেয়ার করি না; সেলার ম্যানুয়ালি যাচাই করে।'
          : 'We do not share your payment UTR with third parties; sellers verify it manually.'}
      </p>
      <Link to="/" className="btn btn-secondary">
        {lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}
      </Link>
    </div>
  )
}
