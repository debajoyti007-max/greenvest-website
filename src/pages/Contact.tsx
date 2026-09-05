import { Link } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { SUPPORT_PHONE } from '../lib/business'
import { STORE_LOCATION } from '../lib/delivery'

export default function Contact() {
  const { lang } = useStore()

  return (
    <div className="page narrow contact-page">
      <div className="contact-hero">
        <span className="contact-icon" aria-hidden>💬</span>
        <h1>{lang === 'bn' ? 'আমাদের সাথে যোগাযোগ করুন' : 'Get in Touch'}</h1>
        <p className="contact-sub">
          {lang === 'bn'
            ? 'অর্ডার বা ডেলিভারি সংক্রান্ত যেকোনো সাহায্যের জন্য সরাসরি ইন-অ্যাপ লাইভ চ্যাটে মেসেজ করুন।'
            : 'For order help, delivery queries or anything else — message us directly in our in-app live chat.'}
        </p>
      </div>

      {/* Primary CTA */}
      <Link
        id="contact-inapp-support-btn"
        to="/support"
        className="contact-wa-cta"
        style={{
          background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.65rem',
          padding: '1rem 1.5rem',
          borderRadius: '16px',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: '1.05rem',
          boxShadow: '0 8px 20px -4px rgba(22, 101, 52, 0.35)',
        }}
      >
        <span style={{ fontSize: '1.4rem' }}>💬</span>
        {lang === 'bn' ? 'ইন-অ্যাপ লাইভ সাপোর্ট ডেস্ক খুলুন' : 'Open In-App Live Support Desk'}
      </Link>

      {/* 🌿 Physical Storefront Card */}
      <div style={{
        background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
        border: '2px solid #86efac',
        borderRadius: '16px',
        padding: '1.25rem',
        margin: '1.5rem 0',
        boxShadow: '0 4px 12px rgba(22, 101, 52, 0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🏪</span>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#166534', margin: 0 }}>
                {lang === 'bn' ? `${STORE_LOCATION.nameBn} - আমাদের ফিজিক্যাল স্টোর` : `${STORE_LOCATION.name} - Physical Store & Outlet`}
              </h2>
              <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
                🟢 {lang === 'bn' ? `খোলা আছে · ${STORE_LOCATION.hoursBn}` : `Open Now · ${STORE_LOCATION.hours}`}
              </span>
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '12px', fontWeight: 700, border: '1px solid #86efac' }}>
            {lang === 'bn' ? 'সরাসরি দোকানে এসে কিনুন' : 'Walk-in & Buy In-Store'}
          </span>
        </div>

        <p style={{ fontSize: '0.9rem', color: '#374151', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
          📍 <strong>{lang === 'bn' ? 'ঠিকানা:' : 'Address:'}</strong> {lang === 'bn' ? STORE_LOCATION.addressBn : STORE_LOCATION.address}
        </p>

        <div style={{ background: '#ffffff', borderRadius: '10px', padding: '0.75rem 1rem', border: '1px solid #bbf7d0', marginBottom: '1rem', fontSize: '0.85rem', color: '#166534' }}>
          <strong>✨ {lang === 'bn' ? 'অফলাইন সুবিধা:' : 'In-Store Advantages:'}</strong>
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem', lineHeight: 1.4 }}>
            <li>{lang === 'bn' ? 'সরাসরি দেখে জ্যান্ত নদী/পুকুরের মাছ ও মাঠের সবজি বেছে নিন' : 'Hand-pick live fresh fish and farm-harvested vegetables in person'}</li>
            <li>{lang === 'bn' ? 'দোকান থেকে সংগ্রহ করলে ₹০ ডেলিভারি চার্জ' : 'Self-Pickup available with ₹0 Delivery Charge'}</li>
            <li>{lang === 'bn' ? 'ক্যাশ বা UPI (Google Pay, PhonePe, Paytm) পেমেন্ট সুবিধা' : 'Pay via Cash or UPI (Google Pay, PhonePe, Paytm)'}</li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <a
            href={STORE_LOCATION.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
          >
            🗺️ {lang === 'bn' ? 'Google Maps-এ লোকেশন দেখুন' : 'Open in Google Maps'}
          </a>
          <a
            href={`tel:${STORE_LOCATION.phone}`}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
          >
            📞 {lang === 'bn' ? 'দোকানে ফোন করুন' : 'Call Store'}
          </a>
        </div>
      </div>

      {/* Info cards */}
      <div className="contact-cards">
        <div className="contact-card">
          <span className="contact-card-icon">📞</span>
          <div>
            <p className="contact-card-label">{lang === 'bn' ? 'সরাসরি ফোন করুন' : 'Customer Care Phone'}</p>
            <a
              id="contact-phone-link"
              href={`tel:${SUPPORT_PHONE}`}
              className="contact-card-value"
            >
              {SUPPORT_PHONE}
            </a>
          </div>
        </div>

        <div className="contact-card">
          <span className="contact-card-icon">🕐</span>
          <div>
            <p className="contact-card-label">{lang === 'bn' ? 'দোকানের সময়' : 'Store Hours'}</p>
            <p className="contact-card-value">{STORE_LOCATION.hours}</p>
          </div>
        </div>

        <div className="contact-card">
          <span className="contact-card-icon">🚚</span>
          <div>
            <p className="contact-card-label">{lang === 'bn' ? 'ডেলিভারি চার্জ' : 'Delivery Charges'}</p>
            <p className="contact-card-value" style={{ fontSize: '0.85rem' }}>
              {lang === 'bn' ? '০-৫ কিমি: ₹৩০ · ৫-১৫ কিমি: ₹৫০' : '0-5km: ₹30 · 5-15km: ₹50'}
            </p>
          </div>
        </div>
      </div>

      {/* ⚖️ Statutory Grievance Redressal & Legal Compliance Card */}
      <div style={{
        marginTop: '1.5rem',
        background: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: '16px',
        padding: '1.25rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.3rem' }}>⚖️</span>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
            {lang === 'bn' ? 'সংবিধিবদ্ধ অভিযোগ প্রতিকার ও আইনি তথ্য' : 'Statutory Grievance Redressal & Compliance'}
          </h3>
        </div>
        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
          {lang === 'bn'
            ? 'উপভোক্তা সুরক্ষা (ই-কমার্স) বিধিমালা, ২০২০ এবং ভারতীয় খাদ্য সুরক্ষা মানদণ্ড (FSSAI) অনুসারে প্রকাশ্য তথ্য:'
            : 'Statutory disclosures under Consumer Protection (E-Commerce) Rules, 2020 and FSSAI standards:'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.82rem', color: '#334155', background: '#f8fafc', padding: '0.85rem', borderRadius: '10px' }}>
          <div>
            <strong>{lang === 'bn' ? 'অভিযোগ কর্মকর্তা:' : 'Grievance Officer:'}</strong> Debajoyti Barman
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>support@greenvest.shop</div>
          </div>
          <div>
            <strong>{lang === 'bn' ? 'খাদ্য মানক ও সুরক্ষা:' : 'Food Safety Standard:'}</strong> FSSAI Hygiene Compliant
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>100% Unadulterated & Fresh</div>
          </div>
          <div>
            <strong>{lang === 'bn' ? 'পণ্যের উৎস:' : 'Country of Origin:'}</strong> India 🇮🇳 (West Bengal)
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Local Farm & Mandi Sourced</div>
          </div>
          <div>
            <strong>{lang === 'bn' ? 'আইনি এখতিয়ার:' : 'Jurisdiction:'}</strong> Tamluk, Purba Medinipur
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Response within 48 Hours</div>
          </div>
        </div>
      </div>
    </div>
  )
}
