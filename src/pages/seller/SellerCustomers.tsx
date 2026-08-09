import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import type { Order } from '../../types'

type CustomerRow = {
  key: string
  name: string
  email: string
  phone: string
  orders: number
  spent: number
  lastOrderAt: string
  lastAddress: string
}

function waCustomer(phone: string, name: string) {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '91')
  const text = encodeURIComponent(
    `নমস্কার ${name}, GreenVest থেকে বলছি। আপনার অর্ডার নিয়ে যোগাযোগ।`,
  )
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer')
}

function buildCustomers(orders: Order[]): CustomerRow[] {
  const map = new Map<string, CustomerRow>()
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const key = o.userId || o.phone || o.userEmail
    const prev = map.get(key)
    const spentAdd = o.utrVerified ? o.total : 0
    if (!prev) {
      map.set(key, {
        key,
        name: o.userName,
        email: o.userEmail,
        phone: o.phone,
        orders: 1,
        spent: spentAdd,
        lastOrderAt: o.createdAt,
        lastAddress: o.address,
      })
    } else {
      prev.orders += 1
      prev.spent += spentAdd
      if (o.createdAt > prev.lastOrderAt) {
        prev.lastOrderAt = o.createdAt
        prev.lastAddress = o.address
        prev.phone = o.phone
        prev.name = o.userName
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt))
}

export default function SellerCustomers() {
  const { user } = useAuth()
  const { orders, lang } = useStore()

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const customers = useMemo(() => buildCustomers(orders), [orders])

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'কাস্টমার' : 'Customers'}</h1>
        <Link to="/seller" className="btn btn-ghost">
          {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
        </Link>
      </div>
      <p className="lede">
        {lang === 'bn'
          ? 'অর্ডার থেকে কাস্টমার তালিকা — WhatsApp / কল করুন।'
          : 'Customers from orders — WhatsApp or call them.'}
      </p>

      {customers.length === 0 ? (
        <p className="empty">{lang === 'bn' ? 'এখনো কোনো কাস্টমার নেই।' : 'No customers yet.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
                <th>{lang === 'bn' ? 'যোগাযোগ' : 'Contact'}</th>
                <th>{lang === 'bn' ? 'অর্ডার' : 'Orders'}</th>
                <th>{lang === 'bn' ? 'কিনেছে' : 'Spent'}</th>
                <th>{lang === 'bn' ? 'শেষ অর্ডার' : 'Last order'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.key}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="muted">{c.lastAddress}</div>
                  </td>
                  <td>
                    <div><strong>{c.phone || c.email.replace('@greenvest.shop', '')}</strong></div>
                    {!c.email.endsWith('@greenvest.shop') && <div className="muted">{c.email}</div>}
                  </td>
                  <td>{c.orders}</td>
                  <td>₹{c.spent}</td>
                  <td className="muted">{new Date(c.lastOrderAt).toLocaleString()}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => waCustomer(c.phone, c.name)}
                    >
                      WhatsApp
                    </button>
                    <a className="btn btn-ghost" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                      {lang === 'bn' ? 'কল' : 'Call'}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
