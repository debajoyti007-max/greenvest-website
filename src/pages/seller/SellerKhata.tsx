import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { useStore } from '../../context/useStore'
import { isSuperAdmin } from '../../lib/business'
import { showToast } from '../../lib/toast'
import type { CustomerTier, User } from '../../types'

export default function SellerKhata() {
  const { user, users, setUserKhataApproval, setUserTier, refreshUsers } = useAuth()
  const { khataEntries, addKhataTransaction, getUserKhataBalance, lang, sendSupportMessage } = useStore()

  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<'dues' | 'settled' | 'all'>('dues')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAddTxModal, setShowAddTxModal] = useState<User | null>(null)
  const [showSettingsModal, setShowSettingsModal] = useState<User | null>(null)

  // Transaction form state
  const [txType, setTxType] = useState<'payment_credit' | 'order_debit'>('payment_credit')
  const [txAmount, setTxAmount] = useState<number>(100)
  const [txNotes, setTxNotes] = useState<string>('')
  const [txPaymentMethod, setTxPaymentMethod] = useState<'upi' | 'cash'>('upi')

  // Settings form state
  const [settingsApproved, setSettingsApproved] = useState(false)
  const [settingsLimit, setSettingsLimit] = useState(2000)
  const [settingsTier, setSettingsTier] = useState<CustomerTier>('regular')

  useEffect(() => {
    void refreshUsers()
  }, [refreshUsers])

  // Filtered customer list with smart zero-balance handling
  const customerList = useMemo(() => {
    return users.filter((u) => {
      // 🕶️ Shadow Super Admin: completely cloaked from Khata ledger
      if (isSuperAdmin(u)) return false

      const q = search.trim().toLowerCase()
      const matchSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))

      if (!matchSearch) return false

      const bal = getUserKhataBalance(u.id)
      if (filterTab === 'dues') {
        return bal > 0
      }
      if (filterTab === 'settled') {
        return bal === 0 && (u.khataApproved || khataEntries.some((e) => e.userId === u.id))
      }
      return true
    })
  }, [users, search, filterTab, getUserKhataBalance, khataEntries])

  // Summary Metrics
  const summary = useMemo(() => {
    let totalOutstanding = 0
    let totalKhataCustomers = 0
    let duesCustomersCount = 0
    let settledCustomersCount = 0

    users.forEach((u) => {
      if (isSuperAdmin(u)) return
      const bal = getUserKhataBalance(u.id)
      if (bal > 0) {
        totalOutstanding += bal
        duesCustomersCount++
      } else if (u.khataApproved || khataEntries.some((e) => e.userId === u.id)) {
        settledCustomersCount++
      }
      if (u.khataApproved || bal > 0) totalKhataCustomers++
    })
    return { totalOutstanding, totalKhataCustomers, duesCustomersCount, settledCustomersCount }
  }, [users, getUserKhataBalance, khataEntries])

  const handleRecordTx = async () => {
    if (!showAddTxModal || txAmount <= 0) {
      showToast(lang === 'bn' ? 'সঠিক টাকার পরিমাণ দিন' : 'Enter valid amount', '⚠️', 'error')
      return
    }

    try {
      addKhataTransaction(
        showAddTxModal.id,
        txType,
        txAmount,
        txNotes || (txType === 'payment_credit' ? `Payment received via ${txPaymentMethod.toUpperCase()}` : 'Manual debit adjustment'),
      )

      showToast(
        lang === 'bn'
          ? `✅ ₹${txAmount} লেনদেন সফলভাবে খাতা বুকে যোগ হয়েছে!`
          : `✅ ₹${txAmount} transaction recorded in Khata!`,
        '📒'
      )
      setShowAddTxModal(null)
      setTxAmount(100)
      setTxNotes('')
    } catch {
      showToast(lang === 'bn' ? 'লেনদেন যোগ করা যায়নি' : 'Failed to record transaction', '❌', 'error')
    }
  }

  const handleSettleCustomerKhata = async (targetUser: User, balance: number) => {
    if (balance <= 0) {
      showToast(lang === 'bn' ? 'এই গ্রাহকের কোনো বকেয়া নেই (ব্যালেন্স ₹০)' : 'Customer has no outstanding balance (₹0)', 'ℹ️')
      return
    }

    const confirmMsg = lang === 'bn'
      ? `${targetUser.name}-এর সকল বকেয়া ₹${balance} নিষ্পত্তি (Settle) করবেন?\nএটি ডিজিটাল খাতায় অফিসিয়াল পেমেন্ট হিসেবে জমা হবে এবং বকেয়া ₹০ হয়ে যাবে।`
      : `Are you sure you want to settle all dues of ₹${balance} for ${targetUser.name}?\nThis will record an official payment settlement in the passbook and reset the balance to ₹0.`

    if (!window.confirm(confirmMsg)) return

    try {
      addKhataTransaction(
        targetUser.id,
        'payment_credit',
        balance,
        lang === 'bn' ? 'সম্পূর্ণ বকেয়া নিষ্পত্তি (ব্যালেন্স শূন্য করা হয়েছে)' : 'Full Dues Settled / Balance Reset to ₹0 by Staff',
      )

      showToast(
        lang === 'bn'
          ? `✅ ${targetUser.name}-এর বকেয়া ₹${balance} নিষ্পত্তি সফল! বর্তমান ব্যালেন্স ₹০।`
          : `✅ Settled ₹${balance} for ${targetUser.name}! Current balance is ₹0.`,
        '⚖️'
      )
    } catch {
      showToast(lang === 'bn' ? 'নিষ্পত্তি সম্পন্ন করা যায়নি' : 'Failed to settle Khata balance', '❌', 'error')
    }
  }

  const handleSaveSettings = async () => {
    if (!showSettingsModal) return
    try {
      await setUserKhataApproval(showSettingsModal.id, settingsApproved, settingsLimit)
      await setUserTier(showSettingsModal.id, settingsTier)
      showToast(
        lang === 'bn'
          ? `✅ ${showSettingsModal.name}-এর খাতা বুক ও গ্রাহক গ্রেড সেভ হয়েছে!`
          : `✅ Settings updated for ${showSettingsModal.name}!`,
        '⚙️'
      )
      setShowSettingsModal(null)
    } catch {
      showToast(lang === 'bn' ? 'আপডেট করা যায়নি' : 'Update failed', '❌', 'error')
    }
  }

  const handleSendInAppKhataReminder = async (customerUser: User, bal: number) => {
    const text = `📋 [GreenVest Khata Reminder]\nনমস্কার ${customerUser.name}, গ্রীনভেস্টে আপনার বর্তমান বকেয়া খাতা ব্যালেন্স: ₹${bal}। অনুগ্রহ করে সুবিধা মতো পরিশোধ করুন। ধন্যবাদ! 🌱`
    try {
      await sendSupportMessage({
        userId: customerUser.id,
        userName: customerUser.name,
        userPhone: customerUser.phone,
        senderRole: 'seller',
        message: text,
        status: 'open',
      })
      try {
        await navigator.clipboard.writeText(text)
      } catch {}
      showToast(lang === 'bn' ? `ইন-অ্যাপ রিমাইন্ডার পাঠানো ও কপি হয়েছে (₹${bal})` : `In-app reminder sent & copied (₹${bal})`, '📋')
    } catch {
      showToast(lang === 'bn' ? 'রিমাইন্ডার পাঠানো যায়নি' : 'Failed to send reminder', '⚠️')
    }
  }

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page narrow" style={{ maxWidth: '980px', padding: '1rem' }}>
      <div className="page-head" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            📒 {lang === 'bn' ? 'ডিজিটাল খাতা বুক' : 'Digital Khata Ledger'}
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            {lang === 'bn'
              ? 'গ্রাহকদের বকেয়া হিসাব, পেমেন্ট রেকর্ড ও ইন-অ্যাপ রিমাইন্ডার'
              : 'Customer credit ledger, payment tracking & in-app statement reminders'}
          </p>
        </div>
        <Link to="/seller" className="btn btn-ghost">
          ← {lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard'}
        </Link>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '12px', padding: '1rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>
            💰 {lang === 'bn' ? 'মোট বকেয়া পাওনা' : 'Total Outstanding Dues'}
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
            ₹{summary.totalOutstanding}
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '12px', padding: '1rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
            👥 {lang === 'bn' ? 'খাতা গ্রাহক সংখ্যা' : 'Khata Customers'}
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
            {summary.totalKhataCustomers}
          </div>
        </div>

        <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: '12px', padding: '1rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase' }}>
            ⚡ {lang === 'bn' ? 'রিমাইন্ডার সিস্টেম' : 'Instant Reminder'}
          </span>
          <div style={{ fontSize: '0.9rem', color: '#6d28d9', marginTop: '0.5rem', fontWeight: 600 }}>
            {lang === 'bn' ? '১-ক্লিকে ইন-অ্যাপ স্টেটমেন্ট ও UPI রিমাইন্ডার' : '1-Click in-app payment reminder with UPI QR'}
          </div>
        </div>
      </div>

      {/* 🎯 Auto Smart Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setFilterTab('dues')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: filterTab === 'dues' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
            background: filterTab === 'dues' ? '#fef2f2' : '#ffffff',
            color: filterTab === 'dues' ? '#991b1b' : '#475569',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🔴 {lang === 'bn' ? 'বকেয়া দেনাদার' : 'Active Dues Only'}</span>
          <span style={{ background: '#dc2626', color: 'white', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem' }}>
            {summary.duesCustomersCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('settled')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: filterTab === 'settled' ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
            background: filterTab === 'settled' ? '#f0fdf4' : '#ffffff',
            color: filterTab === 'settled' ? '#166534' : '#475569',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🟢 {lang === 'bn' ? 'পরিশোধিত / শূন্য বকেয়া' : 'Settled (₹0 Balance)'}</span>
          <span style={{ background: '#16a34a', color: 'white', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem' }}>
            {summary.settledCustomersCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('all')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: filterTab === 'all' ? '1.5px solid #475569' : '1px solid #cbd5e1',
            background: filterTab === 'all' ? '#f1f5f9' : '#ffffff',
            color: filterTab === 'all' ? '#0f172a' : '#475569',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>👥 {lang === 'bn' ? 'সকল কাস্টমার' : 'All Customers'}</span>
          <span style={{ background: '#64748b', color: 'white', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem' }}>
            {users.length}
          </span>
        </button>
      </div>

      {/* Search toolbar */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'bn' ? 'গ্রাহকের নাম বা ফোন নম্বর দিয়ে খুঁজুন...' : 'Search by customer name or phone...'}
          style={{
            width: '100%',
            padding: '0.65rem 1rem',
            borderRadius: '10px',
            border: '1.5px solid #cbd5e1',
            fontSize: '0.9rem',
          }}
        />
      </div>

      {/* Customer Khata Table */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '0.75rem 1rem' }}>{lang === 'bn' ? 'গ্রাহক' : 'Customer'}</th>
                <th style={{ padding: '0.75rem 1rem' }}>{lang === 'bn' ? 'টায়ার / ছাড়' : 'Tier / Discount'}</th>
                <th style={{ padding: '0.75rem 1rem' }}>{lang === 'bn' ? 'খাতা স্ট্যাটাস' : 'Khata Status'}</th>
                <th style={{ padding: '0.75rem 1rem' }}>{lang === 'bn' ? 'বর্তমান বকেয়া' : 'Balance Due'}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{lang === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {customerList.map((c) => {
                const balance = getUserKhataBalance(c.id)
                const isApproved = Boolean(c.khataApproved)
                const limit = c.khataCreditLimit || 2000
                const tier = c.tier || 'regular'

                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ display: 'block', color: '#0f172a' }}>{c.name}</strong>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>📱 {c.phone}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: tier === 'wholesale' ? '#fef3c7' : tier === 'vip' ? '#dbeafe' : '#f1f5f9',
                          color: tier === 'wholesale' ? '#92400e' : tier === 'vip' ? '#1e40af' : '#475569',
                        }}
                      >
                        {tier === 'wholesale' ? 'Wholesale (-12%)' : tier === 'vip' ? 'VIP (-5%)' : 'Regular'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: isApproved ? '#dcfce7' : '#fee2e2',
                          color: isApproved ? '#15803d' : '#991b1b',
                        }}
                      >
                        {isApproved ? `✓ ${lang === 'bn' ? 'অনুমোদিত' : 'Active'} (₹${limit})` : `✕ ${lang === 'bn' ? 'নিষ্ক্রিয়' : 'Disabled'}`}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ fontSize: '1rem', color: balance > 0 ? '#dc2626' : '#16a34a' }}>
                        ₹{balance}
                      </strong>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {balance > 0 && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', fontWeight: 700, fontSize: '0.75rem' }}
                            onClick={() => void handleSendInAppKhataReminder(c, balance)}
                          >
                            💬 {lang === 'bn' ? 'ইন-অ্যাপ রিমাইন্ডার' : 'In-App Reminder'}
                          </button>
                        )}
                        {balance > 0 && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{
                              background: '#ecfdf5',
                              color: '#065f46',
                              border: '1px solid #a7f3d0',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}
                            onClick={() => handleSettleCustomerKhata(c, balance)}
                          >
                            ⚖️ {lang === 'bn' ? 'নিষ্পত্তি (₹০)' : 'Settle to ₹0'}
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => {
                            setShowAddTxModal(c)
                            setTxType('payment_credit')
                            setTxAmount(balance > 0 ? balance : 100)
                          }}
                        >
                          + {lang === 'bn' ? 'হিসাব লিখুন' : 'Add Entry'}
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => setSelectedUser(c)}
                        >
                          📜 {lang === 'bn' ? 'স্টেটমেন্ট' : 'Statement'}
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => {
                            setShowSettingsModal(c)
                            setSettingsApproved(Boolean(c.khataApproved))
                            setSettingsLimit(c.khataCreditLimit || 2000)
                            setSettingsTier(c.tier || 'regular')
                          }}
                        >
                          ⚙️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ➕ Modal: Add Transaction */}
      {showAddTxModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>
              ➕ {lang === 'bn' ? `${showAddTxModal.name}-এর খাতায় হিসাব যোগ` : `Add Khata Entry for ${showAddTxModal.name}`}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setTxType('payment_credit')}
                style={{
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: txType === 'payment_credit' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: txType === 'payment_credit' ? '#f0fdf4' : '#ffffff',
                  fontWeight: 700,
                  color: txType === 'payment_credit' ? '#166534' : '#475569',
                  cursor: 'pointer',
                }}
              >
                🟢 {lang === 'bn' ? 'টাকা জমা পেয়েছি (Credit)' : 'Payment Received'}
              </button>

              <button
                type="button"
                onClick={() => setTxType('order_debit')}
                style={{
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: txType === 'order_debit' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                  background: txType === 'order_debit' ? '#fef2f2' : '#ffffff',
                  fontWeight: 700,
                  color: txType === 'order_debit' ? '#991b1b' : '#475569',
                  cursor: 'pointer',
                }}
              >
                🔴 {lang === 'bn' ? 'বাকি বা সামগ্রী দেওয়া (Debit)' : 'Give Credit/Debit'}
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
              {lang === 'bn' ? 'টাকার পরিমাণ (₹):' : 'Amount (₹):'}
              <input
                type="number"
                min={1}
                value={txAmount}
                onChange={(e) => setTxAmount(Number(e.target.value) || 0)}
                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', fontWeight: 700 }}
              />
            </label>

            {txType === 'payment_credit' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                {lang === 'bn' ? 'পেমেন্টের মাধ্যম:' : 'Payment Method:'}
                <select
                  value={txPaymentMethod}
                  onChange={(e) => setTxPaymentMethod(e.target.value as 'upi' | 'cash')}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                >
                  <option value="upi">UPI (GPay / PhonePe / QR)</option>
                  <option value="cash">Cash (নগদ)</option>
                </select>
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
              {lang === 'bn' ? 'মন্তব্য বা কারণ:' : 'Notes / Reference:'}
              <input
                type="text"
                value={txNotes}
                onChange={(e) => setTxNotes(e.target.value)}
                placeholder={txType === 'payment_credit' ? 'e.g. GPay payment received' : 'e.g. 5kg potato + 2kg onion on credit'}
                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddTxModal(null)}>
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleRecordTx}>
                ✓ {lang === 'bn' ? 'সেভ করুন' : 'Record Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚙️ Modal: Customer Khata Settings & Tier */}
      {showSettingsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>
              ⚙️ {lang === 'bn' ? `${showSettingsModal.name}-এর সেটিংস` : `Settings for ${showSettingsModal.name}`}
            </h3>

            {/* Customer Tier */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
              {lang === 'bn' ? 'গ্রাহকের প্রাইসিং টায়ার (Tier / Dynamic Pricing):' : 'Pricing Tier (Dynamic Pricing):'}
              <select
                value={settingsTier}
                onChange={(e) => setSettingsTier(e.target.value as CustomerTier)}
                style={{ padding: '0.5rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 600 }}
              >
                <option value="regular">Regular Customer (সাধারণ দর)</option>
                <option value="vip">VIP Customer (5% স্বয়ংক্রিয় ছাড়)</option>
                <option value="wholesale">Wholesale / পাইকারি (12% স্বয়ংক্রিয় ছাড়)</option>
              </select>
            </label>

            {/* Khata Approval */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', margin: '0.5rem 0' }}>
              <input
                type="checkbox"
                checked={settingsApproved}
                onChange={(e) => setSettingsApproved(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              {lang === 'bn' ? 'ডিজিটাল খাতা বুক সুবিধা সক্রিয় করুন' : 'Enable Digital Khata Credit for Customer'}
            </label>

            {/* Credit Limit */}
            {settingsApproved && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                {lang === 'bn' ? 'সর্বোচ্চ বাকি সীমা (Credit Limit ₹):' : 'Credit Limit (₹):'}
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={settingsLimit}
                  onChange={(e) => setSettingsLimit(Number(e.target.value) || 2000)}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                />
              </label>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowSettingsModal(null)}>
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveSettings}>
                ✓ {lang === 'bn' ? 'সেটিংস সংরক্ষণ' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📜 Modal: Full Transaction Statement */}
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '580px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>📜 {selectedUser.name} - Khata Statement</h3>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>📱 {selectedUser.phone}</span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedUser(null)}>
                ✕
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{lang === 'bn' ? 'মোট বকেয়া পাওনা:' : 'Total Outstanding:'}</span>
              <strong style={{ fontSize: '1.25rem', color: '#dc2626' }}>
                ₹{getUserKhataBalance(selectedUser.id)}
              </strong>
            </div>

            {/* Transaction List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {khataEntries
                .filter((e) => e.userId === selectedUser.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: e.type === 'payment_credit' ? '#f0fdf4' : '#fff7ed',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: e.type === 'payment_credit' ? '#166534' : '#9a3412', display: 'block' }}>
                        {e.type === 'payment_credit' ? `🟢 Payment Received (${e.paymentMethod || 'UPI'})` : `🔴 Order / Debit (${e.orderId ? `Order #${e.orderId.slice(-6)}` : 'Manual'})`}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(e.createdAt).toLocaleString()} · {e.notes}
                      </span>
                    </div>
                    <strong style={{ fontSize: '1rem', color: e.type === 'payment_credit' ? '#16a34a' : '#dc2626' }}>
                      {e.type === 'payment_credit' ? `-₹${e.amount}` : `+₹${e.amount}`}
                    </strong>
                  </div>
                ))}
              {khataEntries.filter((e) => e.userId === selectedUser.id).length === 0 && (
                <p style={{ textAlign: 'center', color: '#94a3b8', margin: '1rem 0' }}>
                  {lang === 'bn' ? 'কোনো লেনদেনের হিসাব নেই।' : 'No transaction history found.'}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedUser(null)}>
                {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
