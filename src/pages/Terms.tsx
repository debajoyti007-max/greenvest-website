import { Link } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT, SUPPORT_PHONE } from '../lib/business'
import { STORE_LOCATION } from '../lib/delivery'

export default function Terms() {
  const { lang } = useStore()

  return (
    <div className="page narrow legal-page" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.6rem', color: '#166534', margin: '0 0 0.4rem' }}>
          {lang === 'bn' ? 'ব্যবহারের শর্তাবলী ও ক্রেতা নীতিমালা' : 'Terms of Service & Customer Policy'}
        </h1>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
          {lang === 'bn'
            ? 'সর্বশেষ আপডেট: সেপ্টেম্বর ২০২৬ · উপভোক্তা সুরক্ষা আইন, ২০১৯ ও ভারতীয় ই-কমার্স বিধিমালা দ্বারা নিয়ন্ত্রিত'
            : 'Last Updated: September 2026 · Governed under Consumer Protection Act, 2019 & E-Commerce Rules'}
        </p>
      </div>

      {/* Section 1: Business Overview & Produce Sourcing */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '১. প্ল্যাটফর্ম ও পণ্যের উৎস (Country of Origin)' : '1. Platform & Sourcing (Country of Origin)'}
        </h2>
        <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155' }}>
          {lang === 'bn'
            ? 'GreenVest (greenvest.shop) তাজা শাকসবজি ও জীবন্ত/তাজা মাছ সরবরাহকারী গ্রোসারি প্ল্যাটফর্ম। আমাদের সমস্ত পণ্য প্রতিদিন সকালে পূর্ব মেদিনীপুরের স্থানীয় মাঠ ও মান্ডি থেকে সংগ্রহ করা হয়। কান্ট্রি অফ অরিজিন: ভারত (India 🇮🇳)।'
            : 'GreenVest (greenvest.shop) is a fresh farm-produce and fish retail platform. All vegetables and fish are sourced daily from local Purba Medinipur farms and licensed mandis. Country of Origin: India 🇮🇳.'}
        </p>
      </section>

      {/* Section 2: Pricing, Dressing Loss & GST */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '২. মূল্য, মাছ কাটিং ও ওজন নীতিমালা' : '2. Dynamic Pricing, Fish Dressing & Weight'}
        </h2>
        <ul style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155', paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lang === 'bn' ? 'দৈনিক রেট ও গ্রেড:' : 'Daily Mandi Rates & Grades:'}</strong>{' '}
            {lang === 'bn'
              ? 'মান্ডি দর প্রতিদিন সকালে আপডেট হয়। পণ্যের গ্রেড A (প্রিমিয়াম), গ্রেড B (স্ট্যান্ডার্ড) ও গ্রেড C (সাধারণ) অনুযায়ী মূল্য নির্ধারিত হয়।'
              : 'Prices update daily based on morning wholesale mandi rates across Quality Grades A, B, and C.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? '🐟 মাছ কাটিং ও ওজন হ্রাস (Dressing Loss):' : '🐟 Fish Dressing & Cleaning Loss:'}</strong>{' '}
            {lang === 'bn'
              ? 'পুরো মাছ কাটার পর আঁশ, ফুলকা ও নাড়িভুঁড়ি বাদ দেওয়ায় পরিষ্কৃত ওজন (Dressed Weight) মূল ওজনের তুলনায় ১৫%–২৫% পর্যন্ত কমে যায়।'
              : 'Whole fish cleaned and cut will naturally have a 15%–25% lower net dressed weight due to descaling, gill, and gut removal.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'সবজির আর্দ্রতা:' : 'Moisture Variance:'}</strong>{' '}
            {lang === 'bn'
              ? 'কাঁচা শাকসবজিতে প্রাকৃতিক আর্দ্রতা হ্রাসের কারণে ৩%–৫% ওজনের সামান্য হেরফের হতে পারে।'
              : 'Fresh vegetables may carry a minor ±3%–5% natural moisture transpiration variance during transit.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'জিএসটি (GST):' : '0% GST Exemption:'}</strong>{' '}
            {lang === 'bn'
              ? 'অপ্রক্রিয়াজাত কাঁচা শাকসবজি ও মাছে সরকারি নিয়ম অনুযায়ী ০% জিএসটি (GST Exempt)।'
              : 'Fresh raw vegetables and unprocessed fish attract 0% GST under Indian tax regulations.'}
          </li>
        </ul>
      </section>

      {/* Section 3: Ordering, Advance & Khata */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '৩. অর্ডার, অগ্রিম পেমেন্ট ও খাতা পে' : '3. Ordering, Advance Payment & Khata Credit'}
        </h2>
        <ul style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155', paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lang === 'bn' ? 'সর্বনিম্ন অর্ডার:' : 'Minimum Order:'}</strong>{' '}
            {lang === 'bn' ? `হোম ডেলিভারির জন্য সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT}।` : `Minimum order value for home delivery is ₹${MIN_ORDER_AMOUNT}.`}
          </li>
          <li>
            <strong>{lang === 'bn' ? '১০% অগ্রিম UPI:' : '10% Advance UPI:'}</strong>{' '}
            {lang === 'bn'
              ? 'অর্ডার বুক করতে ১০% অগ্রিম পেমেন্ট দিতে হয়। সেলার কনফার্ম করলে বাকি টাকা ডেলিভারির সময় প্রদেয়।'
              : 'A 10% UPI advance is required to place orders; balance is payable upon doorstep delivery.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'খাতা পে (Khata Pay):' : 'Khata Credit Facility:'}</strong>{' '}
            {lang === 'bn'
              ? 'অনুমোদিত নিয়মিত ক্রেতাদের জন্য ৭–১৫ দিনের বাকির সুবিধা। সময়মতো বকেয়া পরিশোধ না হলে খাতা সুবিধা সাময়িক স্থগিত থাকবে।'
              : 'Approved customers enjoy 7–15 day credit. Unpaid balances past the due date will suspend credit orders.'}
          </li>
        </ul>
      </section>

      {/* Section 4: Delivery, Handover OTP & Extension Policy */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '৪. ডেলিভারি সময় (১২–২৪ ঘণ্টা), ওটিপি ও শর্ত' : '4. Delivery Timeline (12–24h), Handover OTP & Rules'}
        </h2>
        <ul style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155', paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lang === 'bn' ? `⏱️ ডেলিভারি সময়সীমা (${DELIVERY_WINDOW_BN}):` : `⏱️ Delivery Window (${DELIVERY_WINDOW}):`}</strong>{' '}
            {lang === 'bn'
              ? 'স্ট্যান্ডার্ড ডেলিভারি সাধারণত ১২ থেকে ২৪ ঘণ্টার মধ্যে সম্পন্ন হয়। তবে ভারী বৃষ্টি, প্রতিকূল আবহাওয়া, রাস্তাঘাট বা মান্ডির জোগান ঘাটতির কারণে ডেলিভারি সময় বৃদ্ধি (Extend) হতে পারে। নির্দিষ্ট তারিখে শিডিউল করা অর্ডার নির্বাচিত দিনেই ডেলিভারি হবে।'
              : 'Standard orders are delivered within 12 to 24 hours. However, delivery time can be extended in cases of heavy rain, adverse weather, road disruptions, or wholesale mandi supply constraints. Scheduled date orders are fulfilled on the selected date.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? '🔑 ৪-সংখ্যার হ্যান্ডওভার OTP:' : '🔑 4-Digit Handover OTP:'}</strong>{' '}
            {lang === 'bn'
              ? 'প্যাকেট দেখে সন্তুষ্ট হয়ে অ্যাপে প্রদর্শিত ৪-সংখ্যার সিকিউরিটি OTP রাইডারকে দিলে ডেলিভারি সম্পূর্ণ গণ্য হবে।'
              : 'Customers must verify their produce and provide the 4-digit Handover OTP shown on their order screen to the rider.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? '২-মিনিট ডোরস্টেপ পরীক্ষা:' : '2-Minute Inspection Window:'}</strong>{' '}
            {lang === 'bn'
              ? 'পচনশীল পণ্য হওয়ায় রাইডারের সামনে ২ মিনিট সময় নিয়ে পণ্য দেখে নেওয়ার অনুরোধ করা হচ্ছে।'
              : 'Customers have a 2-minute window with the rider at the doorstep to inspect freshness and weight.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'গ্রাহক অনুপস্থিতি / ডেলিভারি প্রত্যাখ্যান:' : 'Unreachable Customer / Non-Delivery:'}</strong>{' '}
            {lang === 'bn'
              ? 'রাইডার পৌঁছানোর পর গ্রাহক ১০ মিনিটের মধ্যে সাড়া না দিলে বা অযৌক্তিকভাবে গ্রহণ না করলে পচনশীল সামগ্রী নষ্ট হওয়ায় অগ্রিম ১০% অর্থ বাজেয়াপ্ত হতে পারে।'
              : 'If a customer is unreachable for 10 minutes upon rider arrival or rejects fresh produce without cause, the 10% advance is forfeited.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'এলাকা ও সেলফ-পিকআপ:' : 'Service Area & Pickup:'}</strong>{' '}
            {lang === 'bn'
              ? `পিনকোড ৭২১৬৩২, ৭২১৬৩৩, ৭২১৬৪৩। স্টোর থেকে সেলফ-পিকআপে (${STORE_LOCATION.address}) ₹০ ডেলিভারি চার্জ।`
              : `Serviceable PINs: 721632, 721633, 721643. Self-pickup at our store (${STORE_LOCATION.address}) has ₹0 delivery charge.`}
          </li>
        </ul>
      </section>

      {/* Section 5: Cancellation, Replacement & Refund */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '৫. বাতিল, রিপ্লেসমেন্ট ও রিফান্ড নীতিমালা' : '5. Cancellation, Replacement & Refund Policy'}
        </h2>
        <ul style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155', paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lang === 'bn' ? 'প্যাকিংয়ের আগে বাতিল:' : 'Pre-Packing Cancellation:'}</strong>{' '}
            {lang === 'bn'
              ? 'সেলার অর্ডার কনফার্ম করার পূর্বে বাতিল করলে অগ্রিম পেমেন্টের ১০০% অর্থ সঙ্গে সঙ্গে ফেরতযোগ্য।'
              : 'Orders cancelled before seller confirmation receive a 100% immediate refund of advance paid.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'ত্রুটিপূর্ণ পণ্যের রিপ্লেসমেন্ট:' : 'Same-Day Replacement:'}</strong>{' '}
            {lang === 'bn'
              ? `ডেলিভারির ২ ঘণ্টার মধ্যে কোনো ত্রুটি দেখা দিলে হেল্পলাইনে (${SUPPORT_PHONE}) জানালে বিনামূল্যে বদল বা রিফান্ড দেওয়া হয়।`
              : `Internal defects reported within 2 hours of delivery via helpline (${SUPPORT_PHONE}) get free replacement or refund.`}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'রিফান্ড সময়সীমা:' : 'UPI Refund Timeline:'}</strong>{' '}
            {lang === 'bn'
              ? 'অনুমোদিত রিফান্ড ২৪ থেকে ৪৮ ঘণ্টার মধ্যে গ্রাহকের মূল UPI অ্যাকাউন্টে ফেরত পাঠানো হয়।'
              : 'Approved refunds are credited directly to the customer original UPI account within 24–48 hours.'}
          </li>
        </ul>
      </section>

      {/* Section 6: Grievance Officer & Dispute Resolution */}
      <section
        className="legal-section"
        style={{
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '1rem 1.2rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.1rem', color: '#0f172a', margin: '0 0 0.4rem' }}>
          ⚖️ {lang === 'bn' ? '৬. সংবিধিবদ্ধ অভিযোগ কর্মকর্তা ও আইনি এখতিয়ার' : '6. Grievance Redressal & Jurisdiction'}
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#475569', margin: '0 0 0.6rem' }}>
          {lang === 'bn'
            ? 'উপভোক্তা সুরক্ষা (ই-কমার্স) বিধিমালা, ২০২০ অনুযায়ী অভিযোগ কর্মকর্তা:'
            : 'Statutory Grievance Officer under Consumer Protection (E-Commerce) Rules, 2020:'}
        </p>
        <div style={{ fontSize: '0.84rem', lineHeight: '1.5', color: '#1e293b' }}>
          <div><strong>{lang === 'bn' ? 'কর্মকর্তা:' : 'Officer:'}</strong> Debajoyti Barman (Admin & Grievance Officer)</div>
          <div><strong>{lang === 'bn' ? 'ইমেইল ও ফোন:' : 'Email & Phone:'}</strong> support@greenvest.shop / debajoyti007@gmail.com · {SUPPORT_PHONE}</div>
          <div><strong>{lang === 'bn' ? 'আইনি এখতিয়ার:' : 'Jurisdiction:'}</strong> {lang === 'bn' ? 'তমলুক / পূর্ব মেদিনীপুর আদালত, পশ্চিমবঙ্গ।' : 'Courts at Tamluk / Purba Medinipur, West Bengal.'}</div>
          <div style={{ marginTop: '0.3rem', color: '#166534', fontWeight: 600, fontSize: '0.8rem' }}>
            ⏱️ {lang === 'bn' ? 'অভিযোগ প্রাপ্তি স্বীকার: ৪৮ ঘণ্টায় · চূড়ান্ত নিষ্পত্তি: ৩০ দিনে।' : 'Acknowledgement: 48 hours · Final Disposal: 30 days.'}
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link to="/" className="btn btn-primary">
          {lang === 'bn' ? '← দোকানে ফিরুন' : '← Back to shop'}
        </Link>
        <Link to="/privacy" className="btn btn-secondary">
          {lang === 'bn' ? 'গোপনীয়তা নীতি দেখুন →' : 'View Privacy Policy →'}
        </Link>
      </div>
    </div>
  )
}
