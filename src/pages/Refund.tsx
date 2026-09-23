import { Link } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { SUPPORT_PHONE, STORE_NAME } from '../lib/business'

export default function Refund() {
  const { lang, setLang } = useStore()

  return (
    <div className="page narrow legal-page" style={{ maxWidth: '860px', margin: '0 auto', padding: '1rem 1rem 4rem' }}>
      {/* ── Top Header Badge ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f8fafc 100%)',
          border: '1.5px solid #86efac',
          borderRadius: '20px',
          padding: '1.75rem 1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 10px 25px -5px rgba(22, 101, 52, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#dcfce7',
                color: '#15803d',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              🔄 {lang === 'bn' ? 'অফিসিয়াল রিফান্ড ও বাতিল নীতি' : 'Official Refund & Cancellation Policy'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              • {lang === 'bn' ? 'সংস্করণ ৩.২' : 'Version 3.2'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#166534',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
            }}
          >
            🌐 {lang === 'bn' ? 'English-এ দেখুন' : 'বাংলায় দেখুন'}
          </button>
        </div>

        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem', letterSpacing: '-0.5px' }}>
          {lang === 'bn' ? `${STORE_NAME} বাতিল, রিপ্লেসমেন্ট ও রিফান্ড নীতি` : `${STORE_NAME} Cancellation, Replacement & Refund Policy`}
        </h1>
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>
          {lang === 'bn'
            ? 'উপভোক্তা সুরক্ষা (ই-কমার্স) বিধিমালা ২০২০ এবং ভারতীয় ভোক্তা অধিকার আইনের অধীনে গ্রাহকের স্বার্থ রক্ষার্থে প্রণীত।'
            : 'Governed under Consumer Protection (E-Commerce) Rules 2020 & Consumer Protection Act 2019 to safeguard buyer interests.'}
        </p>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
          <span>📅 {lang === 'bn' ? 'কার্যকর তারিখ: সেপ্টেম্বর ২০২৬' : 'Effective: September 2026'}</span>
          <span>📍 {lang === 'bn' ? 'অঞ্চল: পূর্ব মেদিনীপুর, পশ্চিমবঙ্গ' : 'Territory: Purba Medinipur, West Bengal'}</span>
          <span>⚡ {lang === 'bn' ? 'সহায়তা: ২৪/৭ খোলা' : 'Support: 24/7 Available'}</span>
        </div>
      </div>

      {/* ── Key Highlights Summary Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>⏱️</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.2rem' }}>
            {lang === 'bn' ? 'প্যাকিংয়ের আগে ১০০% ফ্রি বাতিল' : '100% Free Pre-Pack Cancellation'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            {lang === 'bn' ? 'সেলার গ্রহণ করার পূর্বে ১-ট্যাপে অর্ডার বাতিল করুন' : 'Instant 1-tap cancellation before seller packing begins'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🛡️</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.2rem' }}>
            {lang === 'bn' ? '২ ঘণ্টার মধ্যে ফ্রি বদল' : '2-Hour Free Replacement'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            {lang === 'bn' ? 'কোনো পণ্যে ত্রুটি থাকলে ছবিসহ জানালে তাৎক্ষণিক বদল' : 'Doorstep replacement or refund for any defective produce'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>💳</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.2rem' }}>
            {lang === 'bn' ? '২৪-৪৮ ঘণ্টার মধ্যে UPI ফেরত' : 'Direct UPI Refund in 24-48h'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            {lang === 'bn' ? 'অনুমোদিত অর্থ সরাসরি আপনার ব্যাংক অ্যাকাউন্টে জমা হয়' : 'Refunds credited to original payment source account'}
          </div>
        </div>
      </div>

      {/* ── Policy Sections ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Section 1 */}
        <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> {lang === 'bn' ? '১. অর্ডার বাতিল প্রক্রিয়া (Cancellation Rules)' : '1. Order Cancellation Rules'}
          </h2>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'স্বয়ংক্রিয় ১-ট্যাপ বাতিল:' : 'Self-Service 1-Tap Cancellation:'}</strong>{' '}
              {lang === 'bn'
                ? 'অর্ডার দেওয়ার পর যতক্ষণ না সেলার অর্ডারটি অনুমোদন বা প্যাকিং শুরু করছেন (স্ট্যাটাস: পেন্ডিং বা অ্যাডভান্স রিসিভড, সাধারণত বুকিংয়ের ১৫ মিনিটের মধ্যে), ততক্ষণ গ্রাহক আমাদের ট্র্যাক অর্ডার বা অর্ডার ইতিহাস পেজ থেকে সরাসরি ১-ট্যাপে অর্ডার বাতিল করতে পারবেন।'
                : 'Customers can cancel their order self-service with 1 tap from Track Order or Order History while the order is in pending status before the seller initiates packaging.'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'অনুমোদনের পর বাতিলের সীমাবদ্ধতা (Post-Acceptance Policy):' : 'Post-Acceptance Cancellation Restrictions:'}</strong>{' '}
              {lang === 'bn'
                ? 'পচনশীল তাজা শাকসবজি ও কাঁচা মাছ কাটিং ও প্যাকেটজাত শুরু হয়ে গেলে কিংবা রাইডার ডেলিভারির উদ্দেশ্যে রওনা হওয়ার পর (স্ট্যাটাস: Confirmed বা Out for Delivery) একতরফা বাতিল গ্রহণযোগ্য নয়। পচনশীল পণ্যের অপচয় রোধ ও মৎস্য কাটিংয়ের ক্ষতির কারণে এই নীতি প্রযোজ্য।'
                : 'Because fresh agricultural produce and customized dressed fish are highly perishable, orders cannot be unilaterally cancelled once confirmed or dispatched out for delivery.'}
            </li>
            <li>
              <strong>{lang === 'bn' ? 'জরুরি প্রয়োজনে যোগাযোগ:' : 'Urgent Exceptions:'}</strong>{' '}
              {lang === 'bn'
                ? `অনিবার্য কোনো কারণে অর্ডার অনুমোদনের পর বাতিল করতে হলে তাৎক্ষণিকভাবে আমাদের হেল্পলাইনে (${SUPPORT_PHONE}) যোগাযোগ করুন। পণ্য রওনা না হয়ে থাকলে সেলারের সাথে সমন্বয় করে ব্যবস্থা নেওয়া হবে।`
                : `For emergency cancellation after seller confirmation, promptly reach our support desk at ${SUPPORT_PHONE}. If dispatch has not begun, an exception may be coordinated.`}
            </li>
          </ul>
        </section>

        {/* Section 2 */}
        <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚪</span> {lang === 'bn' ? '২. ডোরস্টেপ ভেরিফিকেশন ও হ্যান্ডওভার OTP' : '2. Doorstep Verification & Handover OTP'}
          </h2>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'প্যাকেট দেখে সন্তুষ্ট হওয়া:' : 'Open Box Inspection:'}</strong>{' '}
              {lang === 'bn'
                ? 'ডেলিভারি বয় পৌঁছালে প্যাকেট খুলে তাজা শাকসবজি ও মাছের গুণমান এবং পরিমাণ নিজে দেখে যাচাই করে নিন।'
                : 'Customers are encouraged to inspect produce freshness and quantity at the doorstep prior to handover.'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? '৪-সংখ্যার সিকিউরিটি OTP:' : '4-Digit Handover OTP:'}</strong>{' '}
              {lang === 'bn'
                ? 'পণ্য দেখে সম্পূর্ণ সন্তুষ্ট হওয়ার পরেই কেবলমাত্র আপনার অর্ডার ট্র্যাকিং স্ক্রিনে প্রদর্শিত ৪-সংখ্যার গোপন সিকিউরিটি OTP রাইডারকে দিন। ওটিপি প্রদান করাই সন্তোষজনক ডেলিভারির অফিসিয়াল প্রমাণ।'
                : 'Provide the 4-digit security OTP only after physical satisfaction with produce quality. OTP verification confirms successful handover.'}
            </li>
            <li>
              <strong>{lang === 'bn' ? 'ডোরস্টেপেই অস্বীকৃতি:' : 'Doorstep Rejection for Quality Reasons:'}</strong>{' '}
              {lang === 'bn'
                ? 'ডেলিভারির সময় যদি কোনো পণ্য নষ্ট বা মানের হেরফের দেখা যায়, তবে তৎক্ষণাৎ তা রাইডারকে ফেরত দিতে পারেন। উক্ত ত্রুটিপূর্ণ আইটেমের সমপরিমাণ অর্থ সম্পূর্ণ ফেরত প্রদান করা হবে।'
                : 'If any produce fails quality standards at delivery, you may decline the item directly with the rider. Full credit or refund will be processed.'}
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔄</span> {lang === 'bn' ? '৩. ২-ঘণ্টার মধ্যে ফ্রি রিপ্লেসমেন্ট গ্যারান্টি' : '3. 2-Hour Replacement Guarantee'}
          </h2>
          <p style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: '0 0 0.8rem' }}>
            {lang === 'bn'
              ? 'ডেলিভারির পর কোনো ফল বা সবজির ভেতর অপ্রত্যাশিত ত্রুটি ধরা পড়লে (যেমন কাটার পর ভেতরের পোকা বা নষ্ট ভাব):'
              : 'If internal produce defects are discovered upon preparation (e.g. inner rot or spoilage not visible from outside):'}
          </p>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              {lang === 'bn'
                ? `ডেলিভারির ২ ঘণ্টার মধ্যে আমাদের হোয়াটসঅ্যাপ হেল্পলাইনে (${SUPPORT_PHONE}) ত্রুটিপূর্ণ পণ্যের ছবিসহ মেসেজ পাঠান।`
                : `Contact our WhatsApp helpline (${SUPPORT_PHONE}) within 2 hours of delivery with clear photographs.`}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              {lang === 'bn'
                ? 'আমাদের কাস্টমার সাপোর্ট দল সঙ্গে সঙ্গে বিষয়টি খতিয়ে দেখে সম্পূর্ণ বিনামূল্যে পণ্যটি পরিবর্তন করে দেবে অথবা মূল্যের ১০০% ফেরত দেবে।'
                : 'Our support team will promptly issue a free doorstep replacement or a 100% refund of the item value.'}
            </li>
          </ul>
        </section>

        {/* Section 4 */}
        <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💳</span> {lang === 'bn' ? '৪. রিফান্ড ক্রেডিট সময়সীমা (Refund Settlement)' : '4. Refund Settlement & Timelines'}
          </h2>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'মূল অ্যাকাউন্টে ফেরত:' : 'Direct Source Account Refund:'}</strong>{' '}
              {lang === 'bn'
                ? 'অনুমোদিত সমস্ত রিফান্ডের অর্থ যে ব্যাংক বা UPI অ্যাকাউন্টের মাধ্যমে আপনি পেমেন্ট করেছিলেন, সরাসরি সেই অ্যাকাউন্টে পাঠানো হয়।'
                : 'Approved refunds are credited directly back to the original source UPI/bank account used during checkout.'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'সময়সীমা:' : 'Processing Timeline:'}</strong>{' '}
              {lang === 'bn'
                ? 'রিফান্ড অনুমোদনের ২৪ থেকে ৪৮ ঘণ্টার (ব্যাংকিং কর্মদিবস) মধ্যে আপনার অ্যাকাউন্টে টাকা জমা হয় এবং কনফার্মেশন মেসেজ প্রদান করা হয়।'
                : 'Standard refund turnaround is 24 to 48 banking hours. A payment reference notification is dispatched upon credit.'}
            </li>
            <li>
              <strong>{lang === 'bn' ? 'কোনো লুকানো চার্জ নেই:' : 'Zero Deductions:'}</strong>{' '}
              {lang === 'bn'
                ? 'অনুমোদিত বাতিল বা ত্রুটিপূর্ণ পণ্যের রিফান্ডে কোনো ক্যান্সেলেশন ফি বা প্রসেসিং চার্জ কাটা হয় না (১০০% সম্পূর্ণ রিফান্ড)।'
                : 'No cancellation penalties or restocking deductions apply to valid customer refund claims.'}
            </li>
          </ul>
        </section>

        {/* Section 5: Grievance & Help */}
        <section style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.6rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚖️</span> {lang === 'bn' ? '৫. কাস্টমার সাপোর্ট ও অভিযোগ নিষ্পত্তি' : '5. Customer Support & Grievance Redressal'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 0.8rem' }}>
            {lang === 'bn'
              ? 'উপভোক্তা সুরক্ষা (ই-কমার্স) বিধিমালা ২০২০ অনুযায়ী অভিযোগ কর্মকর্তা:'
              : 'Appointed Grievance Officer pursuant to Consumer Protection (E-Commerce) Rules, 2020:'}
          </p>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
              fontSize: '0.85rem',
              color: '#1e293b',
              marginBottom: '1rem',
            }}
          >
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Grievance Officer</span>
              <strong>Debajoyti Barman</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Official Support Email</span>
              <strong>support@greenvest.shop</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Direct Helpline</span>
              <strong>{SUPPORT_PHONE}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <Link to="/support" style={{ color: '#166534', fontWeight: 700, textDecoration: 'underline' }}>
              💬 {lang === 'bn' ? 'লাইভ সাপোর্ট ডেস্কে যান' : 'Go to Support Desk'}
            </Link>
            <Link to="/terms" style={{ color: '#166534', fontWeight: 700, textDecoration: 'underline' }}>
              📜 {lang === 'bn' ? 'সম্পূর্ণ শর্তাবলী দেখুন' : 'View Full Terms'}
            </Link>
            <Link to="/privacy" style={{ color: '#166534', fontWeight: 700, textDecoration: 'underline' }}>
              🛡️ {lang === 'bn' ? 'গোপনীয়তা নীতি দেখুন' : 'View Privacy Policy'}
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
