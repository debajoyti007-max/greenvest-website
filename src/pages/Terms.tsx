import { Link } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT, SUPPORT_PHONE } from '../lib/business'
import { STORE_LOCATION } from '../lib/delivery'

export default function Terms() {
  const { lang, setLang } = useStore()

  return (
    <div className="page narrow" style={{ maxWidth: '860px', margin: '0 auto', padding: '1rem 1rem 4rem' }}>
      {/* ── Top Official Header Badge ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f8fafc 100%)',
          border: '1.5px solid #86efac',
          borderRadius: '20px',
          padding: '1.75rem 1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 10px 25px -5px rgba(22, 101, 52, 0.08)',
          position: 'relative',
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
              🛡️ {lang === 'bn' ? 'অফিসিয়াল নীতি ও শর্তাবলী' : 'Official Consumer Policy'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              • {lang === 'bn' ? 'সংস্করণ ৩.২' : 'Version 3.2'}
            </span>
          </div>

          {/* Quick Language Toggle */}
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
          {lang === 'bn' ? 'MS Vegetable Center গ্রাহক নীতিমালা ও শর্তাবলী' : 'MS Vegetable Center Terms of Service & Customer Policy'}
        </h1>
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>
          {lang === 'bn'
            ? 'উপভোক্তা সুরক্ষা আইন ২০১৯, তথ্য প্রযুক্তি আইন ২০০০ এবং ভারতীয় ই-কমার্স নীতিমালা দ্বারা নিয়ন্ত্রিত।'
            : 'Governed under the Consumer Protection Act 2019, IT Act 2000 & Consumer Protection (E-Commerce) Rules 2020.'}
        </p>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
          <span>📅 {lang === 'bn' ? 'কার্যকর তারিখ: সেপ্টেম্বর ২০২৬' : 'Effective: September 2026'}</span>
          <span>📍 {lang === 'bn' ? 'অঞ্চল: পূর্ব মেদিনীপুর, পশ্চিমবঙ্গ' : 'Territory: Purba Medinipur, West Bengal'}</span>
          <span>🇮🇳 {lang === 'bn' ? 'কান্ট্রি অফ অরিজিন: ভারত' : 'Origin: India'}</span>
        </div>
      </div>

      {/* ── 4 Key Consumer Guarantees (Quick Summary Cards) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>⏱️</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.2rem' }}>
            {lang === 'bn' ? `ডেলিভারি ${DELIVERY_WINDOW_BN}` : `${DELIVERY_WINDOW} Delivery`}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            {lang === 'bn' ? 'সরাসরি সকালে তাজা মাঠ ও মান্ডি থেকে সংগ্রহ' : 'Morning harvest from local farms & mandis'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🐟</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.2rem' }}>
            {lang === 'bn' ? 'মাছ কাটিং ও ড্রেসিং' : 'Fish Dressing Policy'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            {lang === 'bn' ? 'আঁশ ও নাড়িভুঁড়ি কাটার পর ১৫-২৫% ওজন হ্রাস স্বাভাবিক' : '15%–25% natural dressing loss after cleaning'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🔐</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.2rem' }}>
            {lang === 'bn' ? '৪-সংখ্যার হ্যান্ডওভার OTP' : '4-Digit Delivery OTP'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            {lang === 'bn' ? 'মাল দেখে সন্তুষ্ট হয়ে তবেই রাইডারকে OTP দিন' : 'Inspect produce before sharing OTP with rider'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🔄</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.2rem' }}>
            {lang === 'bn' ? '১০০% রিফান্ড ও বদল' : '100% Refund / Replace'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            {lang === 'bn' ? 'প্যাকিংয়ের আগে ফ্রি ক্যানসেল, ত্রুটিতে ২ ঘণ্টায় বদল' : 'Free pre-pack cancel, 2h defect replacement'}
          </div>
        </div>
      </div>

      {/* ── Policy Sections in Professional Cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Section 1 */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏢</span> {lang === 'bn' ? '১. প্ল্যাটফর্ম পরিচিতি ও পণ্যের উৎস' : '1. Platform Sourcing & Country of Origin'}
          </h2>
          <p style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0 }}>
            {lang === 'bn'
              ? 'MS Vegetable Center (ওয়েবসাইট: greenvest.shop) একটি হাইপারলোকাল তাজা শাকসবজি ও জীবন্ত/তাজা মাছের ডিজিটাল গ্রোসারি প্ল্যাটফর্ম। আমাদের সমস্ত পণ্য প্রতিদিন ভোরবেলায় পূর্ব মেদিনীপুরের স্থানীয় কৃষক, নিজস্ব বাগান এবং লাইসেন্সপ্রাপ্ত মান্ডি থেকে সরাসরি সংগৃহীত হয়। দেশের কৃষি ও কৃষককে উৎসাহিত করতে আমাদের পণ্যের কান্ট্রি অফ অরিজিন সম্পূর্ণ ভারতীয় (India 🇮🇳)।'
              : 'MS Vegetable Center (operated at greenvest.shop) is a hyperlocal fresh farm-produce, fish, and daily essentials platform. All items are harvested fresh every morning from verified Purba Medinipur agricultural farms, local fisheries, and government-regulated wholesale mandis. Country of Origin for all farm items is India 🇮🇳.'}
          </p>
        </div>

        {/* Section 2 */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚖️</span> {lang === 'bn' ? '২. দৈনিক মূল্য, মাছ কাটিং ও ওজন নীতিমালা' : '2. Dynamic Mandi Pricing, Fish Dressing & Weight'}
          </h2>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'দৈনিক মান্ডি দর ও কোয়ালিটি গ্রেড:' : 'Daily Mandi Rates & Grades:'}</strong>{' '}
              {lang === 'bn'
                ? 'কাঁচা সবজি ও মাছের মূল্য প্রতিদিন সকালে মান্ডির দরের ওপর ভিত্তি করে স্বচ্ছভাবে নির্ধারিত হয়। প্রতিটি পণ্যে গ্রেড A (প্রিমিয়াম এক্সপোর্ট কোয়ালিটি), গ্রেড B (স্ট্যান্ডার্ড ফ্রেশ) এবং গ্রেড C (দৈনন্দিন সাধারণ) অনুযায়ী ন্যায্য মূল্য ধার্য করা থাকে।'
                : 'Vegetable and fish rates are transparently synchronized each morning based on local wholesale mandi indices across Quality Grades A (Premium), B (Standard Fresh), and C (Economy).'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? '🐟 মাছ কাটিং ও ওজন হ্রাস (Dressing Loss Disclaimers):' : '🐟 Fish Cleaning & Dressing Loss:'}</strong>{' '}
              {lang === 'bn'
                ? 'তাজা মাছ পরিষ্কার ও কাটিংয়ের ক্ষেত্রে গ্রাহক অর্ডার দেওয়ার সময় সমগ্র জীবন্ত/কাঁচা মাছের ওজন অনুযায়ী মূল্য নির্ধারণ করা হয়। মাছ কাটার পর আঁশ, ফুলকা, পিত্তথলি ও নাড়িভুঁড়ি বাদ দেওয়ায় পরিষ্কৃত ওজন (Dressed Net Weight) মূল ওজনের তুলনায় ১৫% থেকে ২৫% পর্যন্ত কম হতে পারে। এটি আন্তর্জাতিক ও ভারতীয় মৎস্য বিক্রয় নীতি অনুযায়ী একটি স্বাভাবিক প্রাকৃতিক প্রক্রিয়া।'
                : 'Fish pricing is based on gross catch weight. When requested dressed and cut, descaling, fin trimming, gill extraction, and gutting naturally yield a 15% to 25% lower net dressed weight, which is standard in seafood processing.'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? '🥬 আর্দ্রতা হ্রাস (Moisture Transpiration):' : '🥬 Natural Moisture Variance:'}</strong>{' '}
              {lang === 'bn'
                ? 'কাঁচা শাকসবজি ও ফল পরিবহনের সময় প্রাকৃতিক জলীয় বাষ্প হ্রাসের কারণে ৩%–৫% ওজনের সামান্য হেরফের হতে পারে।'
                : 'Fresh leafy greens and vegetables may experience a minor natural transpiration variance of ±3%–5% during logistics transit.'}
            </li>
            <li>
              <strong>{lang === 'bn' ? 'কর অব্যাহতি (0% GST):' : 'Tax Exemption (0% GST):'}</strong>{' '}
              {lang === 'bn'
                ? 'ভারতের পণ্য ও পরিষেবা কর (GST) আইন অনুযায়ী অপ্রক্রিয়াজাত কাঁচা শাকসবজি ও তাজা মাছে ০% জিএসটি প্রযোজ্য (সম্পূর্ণ ট্যাক্স-ফ্রি)।'
                : 'Raw, unprocessed agricultural vegetables and fresh fish carry 0% GST under Indian Central Tax schedules.'}
            </li>
          </ul>
        </div>

        {/* Section 3 */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛒</span> {lang === 'bn' ? '৩. অর্ডার বুকিং ও UPI পেমেন্ট পলিসি' : '3. Ordering & UPI Payment Policy'}
          </h2>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'সর্বনিম্ন অর্ডার মূল্য:' : 'Minimum Order Requirement:'}</strong>{' '}
              {lang === 'bn'
                ? `হোম ডেলিভারির জন্য কার্টের মোট মূল্য সর্বনিম্ন ₹${MIN_ORDER_AMOUNT} হতে হবে।`
                : `A minimum basket value of ₹${MIN_ORDER_AMOUNT} is required for home doorstep delivery.`}
            </li>
            <li>
              <strong>{lang === 'bn' ? '১০% অগ্রিম পেমেন্ট (UPI Advance):' : '10% Commitment Advance:'}</strong>{' '}
              {lang === 'bn'
                ? 'পচনশীল খাদ্যসামগ্রীর অপচয় রোধ ও ভুয়ো অর্ডার প্রতিরোধে অর্ডার নিশ্চিত করতে মাত্র ১০% অগ্রিম UPI পেমেন্ট গ্রহণ করা হয়। বাকি ৯০% অর্থ পণ্য গ্রহণের সময় ক্যাশ বা কিউআর কোডে প্রদেয়।'
                : 'To prevent produce spoilage and unauthorized bookings, orders require a 10% UPI advance. The remaining 90% is settled at the doorstep upon physical verification.'}
            </li>
          </ul>
        </div>

        {/* Section 4 */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛵</span> {lang === 'bn' ? '৪. ডেলিভারি সময়সীমা, হ্যান্ডওভার OTP ও নিরাপত্তা' : '4. Delivery Timelines, Handover OTP & Security'}
          </h2>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? `ডেলিভারি সময়সীমা (${DELIVERY_WINDOW_BN}):` : `Fulfillment Window (${DELIVERY_WINDOW}):`}</strong>{' '}
              {lang === 'bn'
                ? 'স্ট্যান্ডার্ড অর্ডার ১২ থেকে ২৪ ঘণ্টার মধ্যে ডেলিভারি করা হয়। ভারী বৃষ্টি, চরম আবহাওয়া বা প্রত্যন্ত অঞ্চলে যাতায়াত বিঘ্নিত হলে ডেলিভারি সময় যুক্তিসঙ্গতভাবে কিছুটা বাড়তে পারে।'
                : 'Standard orders are delivered within 12 to 24 hours. Adverse weather, monsoon deluges, or logistical interruptions may cause proportionate extensions.'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? '🔑 ৪-সংখ্যার সিকিউরিটি OTP (Security Handover):' : '🔑 4-Digit Handover OTP:'}</strong>{' '}
              {lang === 'bn'
                ? 'ডেলিভারি বয় পৌঁছালে প্যাকেট খুলে পণ্য দেখে সন্তুষ্ট হওয়ার পর আপনার ফোনের স্ক্রিনে দেখানো ৪-সংখ্যার ওটিপি (OTP) রাইডারকে প্রদান করুন। ওটিপি শেয়ার করাই ডেলিভারি সন্তোষজনক সমাপ্তির প্রামাণ্য রূপ।'
                : 'Customers must physically verify the items at the doorstep, then provide the 4-digit Handover OTP generated in their order tracking screen to seal fulfillment.'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'গ্রাহক অনুপস্থিতি ও অপেক্ষার সময়:' : 'Customer Unreachability:'}</strong>{' '}
              {lang === 'bn'
                ? 'রাইডার গন্তব্যে পৌঁছানোর পর অন্তত ১০ মিনিট অপেক্ষা করবেন। গ্রাহক ফোনে সাড়া না দিলে বা অযৌক্তিকভাবে পণ্য গ্রহণে অস্বীকার করলে পচনশীল সামগ্রী নষ্ট হওয়ার ক্ষতিপূরণ বাবদ ১০% অগ্রিম বাজেয়াপ্ত হতে পারে।'
                : 'Riders will hold at the location for up to 10 minutes. If unreachable or produce is rejected without valid cause, the 10% advance is forfeited towards perishable inventory loss.'}
            </li>
            <li>
              <strong>{lang === 'bn' ? 'সার্ভিস এরিয়া ও সেলফ পিকআপ:' : 'Serviceable Hubs & Pickup:'}</strong>{' '}
              {lang === 'bn'
                ? `পিনকোড: ৭২১৬৩২, ৭২১৬৩৩, ৭২১৬৪৩। আমাদের আউটলেট (${STORE_LOCATION.addressBn}) থেকে সেলফ-পিকআপ সম্পূর্ণ ফ্রি (₹০ চার্জ)।`
                : `Serviceable PINs: 721632, 721633, 721643. Store pickup from our outlet (${STORE_LOCATION.address}) is completely free (₹0 charge).`}
            </li>
          </ul>
        </div>

        {/* Section 5 */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#166534', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔄</span> {lang === 'bn' ? '৫. অর্ডার বাতিল, তাৎক্ষণিক রিপ্লেসমেন্ট ও রিফান্ড নীতি' : '5. Cancellation, Instant Replacement & Refund Policy'}
          </h2>
          <ul style={{ fontSize: '0.88rem', lineHeight: '1.65', color: '#334155', margin: 0, paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? 'প্যাকিংয়ের আগে সম্পূর্ণ ফ্রি বাতিল:' : 'Pre-Packing Cancellation:'}</strong>{' '}
              {lang === 'bn'
                ? 'সেলার অর্ডার প্রস্তুত বা প্যাকিং করার পূর্বে গ্রাহক যেকোনো সময় ১-ট্যাপে অর্ডার বাতিল করতে পারেন। বাতিল করলে প্রদত্ত অগ্রিমের ১০০% টাকা সঙ্গে সঙ্গে ফেরতযোগ্য।'
                : 'Orders cancelled before vendor packaging commences receive a 100% immediate refund of advance paid.'}
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>{lang === 'bn' ? '২ ঘণ্টার মধ্যে ত্রুটি রিপোর্ট ও বদল:' : '2-Hour Doorstep Replacement:'}</strong>{' '}
              {lang === 'bn'
                ? `ডেলিভারির সময় বা পরবর্তী ২ ঘণ্টার মধ্যে কোনো পণ্যে দৃশ্যমান ত্রুটি লক্ষ্য করলে আমাদের হেল্পলাইনে (${SUPPORT_PHONE}) ছবিসহ রিপোর্ট করুন। আমরা বিনা মূল্যে পণ্যটি বদল বা সমপরিমাণ অর্থ ক্রেডিট করে দেব।`
                : `Produce with internal defects reported within 2 hours of delivery via helpline (${SUPPORT_PHONE}) with photo evidence is replaced free of cost or refunded.`}
            </li>
            <li>
              <strong>{lang === 'bn' ? 'রিফান্ড ক্রেডিট সময়সীমা:' : 'Direct UPI Refund Timeline:'}</strong>{' '}
              {lang === 'bn'
                ? 'অনুমোদিত সমস্ত রিফান্ড ২৪ থেকে ৪৮ ঘণ্টার মধ্যে গ্রাহকের মূল ব্যাংক বা UPI অ্যাকাউন্টে ফেরত পাঠানো হয়।'
                : 'Approved refunds are credited directly to the customer original source UPI account within 24 to 48 banking hours.'}
            </li>
          </ul>
        </div>

        {/* Section 6 */}
        <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.6rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚖️</span> {lang === 'bn' ? '৬. সংবিধিবদ্ধ উপভোক্তা সুরক্ষা ও অভিযোগ কর্মকর্তা' : '6. Statutory Grievance Redressal & Jurisdiction'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 0.8rem' }}>
            {lang === 'bn'
              ? 'উপভোক্তা সুরক্ষা (ই-কমার্স) বিধিমালা ২০২০ এবং ডিজিটালি পরিচালিত ভারতীয় নীতিমালার অধীনে নির্ধারিত অভিযোগ নিষ্পত্তিকারক:'
              : 'Appointed under Consumer Protection (E-Commerce) Rules, 2020 & Information Technology Act, 2000:'}
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
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Customer Helpline</span>
              <strong>{SUPPORT_PHONE}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Legal Jurisdiction</span>
              <strong>Tamluk / Purba Medinipur, WB</strong>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
            ⏱️ {lang === 'bn' ? 'অভিযোগ প্রাপ্তির স্বীকৃতি: ৪৮ ঘণ্টার মধ্যে · চূড়ান্ত নিষ্পত্তি: ৩০ কার্যদিবসের মধ্যে।' : 'Statutory Acknowledgment: 48 hours · Final Disposal: within 30 working days.'}
          </div>
        </div>

      </div>

      {/* ── Bottom Action Links ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2.5rem', flexWrap: 'wrap' }}>
        <Link to="/" className="btn btn-primary" style={{ padding: '0.65rem 1.5rem', fontWeight: 700 }}>
          {lang === 'bn' ? '← বাজারে ফিরুন' : '← Return to Store'}
        </Link>
        <Link to="/privacy" className="btn btn-secondary" style={{ padding: '0.65rem 1.5rem', fontWeight: 600 }}>
          {lang === 'bn' ? 'গোপনীয়তা নীতি (Privacy) →' : 'Privacy Policy →'}
        </Link>
        <Link to="/support" className="btn btn-secondary" style={{ padding: '0.65rem 1.5rem', fontWeight: 600 }}>
          💬 {lang === 'bn' ? 'সাপোর্ট ডেস্ক' : 'Live Support'}
        </Link>
      </div>
    </div>
  )
}

