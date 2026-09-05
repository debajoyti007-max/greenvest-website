import { Link } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { MIN_ORDER_AMOUNT, SUPPORT_PHONE } from '../lib/business'
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
            ? 'সর্বশেষ আপডেট: আগস্ট ২০২৬ · উপভোক্তা সুরক্ষা আইন, ২০১৯ ও ভারতীয় ই-কমার্স বিধিমালা দ্বারা নিয়ন্ত্রিত'
            : 'Last Updated: August 2026 · Governed under Consumer Protection Act, 2019 & E-Commerce Rules'}
        </p>
      </div>

      {/* Section 1: Business Overview & Produce Sourcing */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '১. প্ল্যাটফর্ম ও তাজা পণ্যের উৎস (Country of Origin)' : '1. Platform & Sourcing (Country of Origin)'}
        </h2>
        <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155' }}>
          {lang === 'bn'
            ? 'GreenVest (greenvest.shop) একটি অনলাইন ও অফলাইন তাজা শাকসবজি ও মাছ সরবরাহকারী প্ল্যাটফর্ম। আমাদের সমস্ত কাঁচা শাকসবজি ও মাছ ভারতের পশ্চিমবঙ্গ রাজ্যের স্থানীয় কৃষক, মাঠ ও অনুমোদিত পাইকারি মান্ডি থেকে দৈনিক ভিত্তিতে তাজা সংগ্রহ করা হয়। কান্ট্রি অফ অরিজিন: ভারত (India 🇮🇳)।'
            : 'GreenVest (greenvest.shop) is an omnichannel fresh grocery and live fish retail platform. All agricultural vegetables and fish are freshly sourced on a daily basis from local West Bengal farms and licensed mandis. Country of Origin: India 🇮🇳.'}
        </p>
      </section>

      {/* Section 2: Pricing, Grades & 0% GST Notice */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '২. মূল্য নির্ধারণ, গ্রেড (A/B/C) ও ট্যাক্স' : '2. Dynamic Pricing, Grades & GST Status'}
        </h2>
        <ul style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155', paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lang === 'bn' ? 'দৈনিক মান্ডি রেট:' : 'Daily Mandi Rates:'}</strong>{' '}
            {lang === 'bn'
              ? 'কৃষি পণ্যের বাজারদর প্রতিদিন সকালে হালনাগাদ করা হয়। প্রদর্শিত মার্কেট MRP স্থানীয় খুচরা বাজারের সাথে সামঞ্জস্যপূর্ণ।'
              : 'Produce rates are updated each morning reflecting daily wholesale mandi benchmarks.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'কোয়ালিটি গ্রেড:' : 'Quality Grading:'}</strong>{' '}
            {lang === 'bn'
              ? 'গ্রেড A (প্রিমিয়াম এক্সপোর্ট সাইজ), গ্রেড B (স্ট্যান্ডার্ড ফ্রেশ), গ্রেড C (দৈনন্দিন সাধারণ রান্না)। গ্রাহক নিজের পছন্দ অনুযায়ী গ্রেড নির্বাচন করতে পারেন।'
              : 'Grade A (Premium Export Quality), Grade B (Standard Fresh), Grade C (Economy/Daily Cooking).'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'জিএসটি (GST) অবস্থান:' : 'GST Exemption Notice:'}</strong>{' '}
            {lang === 'bn'
              ? 'ভারত সরকারের জিএসটি আইন অনুযায়ী তাজা, অপ্রক্রিয়াজাত শাকসবজি ও মাছ ০% জিএসটি (GST Exempt) ধারার অন্তর্ভুক্ত।'
              : 'As per GST regulations in India, fresh, raw, and unbranded vegetables and live fish attract 0% GST (Exempt).'}
          </li>
        </ul>
      </section>

      {/* Section 3: Ordering, Advance & Khata Pay */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '৩. অর্ডার, অগ্রিম পেমেন্ট ও খাতা পে' : '3. Ordering, Advance Payment & Khata Credit'}
        </h2>
        <ul style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155', paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lang === 'bn' ? 'সর্বনিম্ন অর্ডার:' : 'Minimum Order Amount:'}</strong>{' '}
            {lang === 'bn' ? `হোম ডেলিভারির জন্য সর্বনিম্ন অর্ডারের পরিমাণ ₹${MIN_ORDER_AMOUNT}।` : `Minimum order value for home delivery is ₹${MIN_ORDER_AMOUNT}.`}
          </li>
          <li>
            <strong>{lang === 'bn' ? '১০% অগ্রিম পেমেন্ট:' : '10% Advance UPI Payment:'}</strong>{' '}
            {lang === 'bn'
              ? 'অনলাইন অর্ডারে ১০% অগ্রিম UPI পেমেন্ট সম্পন্ন করতে হয়। সেলার অর্ডার কনফার্ম করার পর প্যাকেজিং ও ডেলিভারি শুরু হয়।'
              : 'Orders require 10% advance UPI payment. Orders are confirmed and packed upon seller confirmation.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'খাতা পে (Khata Pay):' : 'Khata Credit Facility:'}</strong>{' '}
            {lang === 'bn'
              ? 'অনুমোদিত নিয়মিত গ্রাহকদের জন্য ০% অগ্রিম পেমেন্টে "এখন অর্ডার করুন, পরে দিন" সুবিধা প্রযোজ্য। বকেয়া সীমা অতিক্রম করলে নতুন অর্ডার সাময়িক স্থগিত হতে পারে।'
              : 'Approved customers may checkout with zero-advance credit. Outstanding dues must be settled periodically as per agreed limits.'}
          </li>
        </ul>
      </section>

      {/* Section 4: Doorstep Inspection & Delivery */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '৪. ডেলিভারি এলাকা ও ডোরস্টেপ কোয়ালিটি পরীক্ষা' : '4. Serviceable Zones & Doorstep Inspection'}
        </h2>
        <ul style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155', paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lang === 'bn' ? 'সার্ভিস এরিয়া:' : 'Serviceable PIN Codes:'}</strong>{' '}
            {lang === 'bn'
              ? 'শুধুমাত্র পূর্ব মেদিনীপুরের পিনকোড ৭২১৬৩২, ৭২১৬৩৩, এবং ৭২১৬৪৩-এর অন্তর্ভুক্ত এলাকায় সরাসরি হোম ডেলিভারি প্রদান করা হয়।'
              : 'Home delivery is strictly operational within PIN codes 721632, 721633, and 721643 in Purba Medinipur, West Bengal.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? '⏱️ ২-মিনিট ডোরস্টেপ পরীক্ষা উইন্ডো:' : '⏱️ 2-Minute Doorstep Inspection Rule:'}</strong>{' '}
            {lang === 'bn'
              ? 'শাকসবজি ও মাছ পচনশীল হওয়ায় রাইডারের উপস্থিতিতে প্যাকেট খুলে পণ্য দেখে নেওয়ার জন্য গ্রাহকের ২ মিনিট সময় থাকে। কোনো সামগ্রী পছন্দ না হলে বা নষ্ট বেরোলে সঙ্গে সঙ্গে ফেরত দেওয়া যাবে।'
              : 'Given the perishable nature of fresh produce, customers have a 2-minute doorstep inspection window with the rider to verify weight and freshness.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'দোকান থেকে সেলফ-পিকআপ:' : 'In-Store Pickup:'}</strong>{' '}
            {lang === 'bn'
              ? `আমাদের ফিজিক্যাল স্টোরে (${STORE_LOCATION.address}) এসে সংগ্রহ করলে ₹০ ডেলিভারি চার্জ প্রযোজ্য।`
              : `Self-pickup from our retail outlet (${STORE_LOCATION.address}) carries ₹0 delivery fee.`}
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
            <strong>{lang === 'bn' ? 'অর্ডার বাতিল:' : 'Pre-Confirmation Cancellation:'}</strong>{' '}
            {lang === 'bn'
              ? 'সেলার কর্তৃক পেমেন্ট যাচাই ও প্যাকেজিং শুরু করার আগে যেকোনো সময় অর্ডার বাতিল করা যায় এবং প্রদত্ত অগ্রিম অর্থ সম্পূর্ণরূপে ফেরতযোগ্য।'
              : 'Orders may be cancelled prior to packing with 100% refund of any advance paid.'}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'ত্রুটিপূর্ণ পণ্য রিপ্লেসমেন্ট:' : 'Same-Day Quality Replacement:'}</strong>{' '}
            {lang === 'bn'
              ? `ডেলিভারির পর কোনো পণ্যে অভ্যন্তরীণ ত্রুটি দেখা দিলে ডেলিভারির ২ ঘণ্টার মধ্যে ওয়েবসাইটের "সাপোর্ট ডেস্ক" বা ${SUPPORT_PHONE}-এ জানালে বিনামূল্যে প্রতিস্থাপন বা রিফান্ড দেওয়া হয়।`
              : `Damaged or defective produce reported within 2 hours of delivery via our Support Desk or ${SUPPORT_PHONE} is eligible for instant free replacement or refund.`}
          </li>
          <li>
            <strong>{lang === 'bn' ? 'রিফান্ড সময়সীমা:' : 'UPI Refund Timeline:'}</strong>{' '}
            {lang === 'bn'
              ? 'অনুমোদিত রিফান্ডের অর্থ ২৪ থেকে ৪৮ ঘণ্টার মধ্যে গ্রাহকের মূল UPI অ্যাকাউন্টে ফেরত পাঠানো হয়।'
              : 'Approved refunds are credited directly to the customer original UPI account within 24–48 hours.'}
          </li>
        </ul>
      </section>

      {/* Section 6: Food Safety & FSSAI Notice */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '৬. খাদ্য সুরক্ষা ও স্বাস্থ্যবিধি (FSSAI Declaration)' : '6. Food Safety & Hygiene Declaration'}
        </h2>
        <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155' }}>
          {lang === 'bn'
            ? 'আমরা ভারতের খাদ্য সুরক্ষা ও মানক কর্তৃপক্ষ (FSSAI)-এর নির্দেশিত স্বাস্থ্যবিধি ও নিরাপদ হ্যান্ডলিং মানদণ্ড অনুসরণ করে পণ্য প্যাক ও ডেলিভারি করি। আমাদের স্টোরেজ ও ডেলিভারি ব্যাগে কোনো ক্ষতিকারক রাসায়নিক বা প্রিজারভেটিভ ব্যবহার করা হয় না।'
            : 'We adhere to the hygiene, handling, and storage standards prescribed under the Food Safety and Standards Authority of India (FSSAI). No artificial ripening agents, toxic washes, or harmful preservatives are used.'}
        </p>
      </section>

      {/* Section 7: Jurisdiction */}
      <section className="legal-section" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          {lang === 'bn' ? '৭. আইনি এখতিয়ার ও বিরোধ নিষ্পত্তি' : '7. Governing Law & Dispute Resolution'}
        </h2>
        <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155' }}>
          {lang === 'bn'
            ? 'এই শর্তাবলী ভারতীয় আইন অনুসারে কার্যকর। যেকোনো বিরোধ প্রথমে আমাদের সংবিধিবদ্ধ অভিযোগ কর্মকর্তার মাধ্যমে সমঝোতার ভিত্তিতে নিষ্পত্তি করা হবে। ব্যর্থ হলে তা তমলুক / পূর্ব মেদিনীপুর আদালতের একচ্ছত্র এখতিয়ারাধীন হবে।'
            : 'These terms are construed in accordance with the laws of India. Any unresolved dispute shall be subject to the exclusive jurisdiction of the courts at Tamluk / Purba Medinipur, West Bengal.'}
        </p>
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
