'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts'

const STATE_LABELS: Record<string, string> = {
  approved:        'Aprobada',
  duplicate_clean: 'Duplicado',
  manipulated:     'Manipulada',
  invalid:         'Inválida',
}

const STATE_COLORS: Record<string, string> = {
  approved:        '#10b981',
  duplicate_clean: '#3b82f6',
  manipulated:     '#ef4444',
  invalid:         '#9ca3af',
}

// Consolida estados equivalentes antes de pasar a los gráficos
function normalizeByState(raw: { state: string; count: number }[]) {
  const merged: Record<string, number> = {}
  for (const { state, count } of raw) {
    if (state === 'pending') continue
    const key = state === 'intercambiada' ? 'manipulated'
               : (state === 'invalida' || state === 'invalid') ? 'invalid'
               : state
    merged[key] = (merged[key] ?? 0) + count
  }
  return Object.entries(merged).map(([state, count]) => ({ state, count }))
}

interface Metrics {
  byDay:        { date: string; count: number }[]
  byState:      { state: string; count: number }[]
  topRejected:  { name: string; total: number; rechazadas: number; tasa: number }[]
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 h-64 animate-pulse">
        <div className="h-4 w-48 bg-gray-100 rounded mb-4" />
        <div className="h-44 bg-gray-50 rounded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-64 animate-pulse">
            <div className="h-4 w-40 bg-gray-100 rounded mb-4" />
            <div className="h-44 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MetricsCharts() {
  const [data, setData] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/metrics')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton />
  if (!data)   return null

  const byState = normalizeByState(data.byState)
  const total   = byState.reduce((s, d) => s + d.count, 0)

  return (
    <div className="space-y-4">

      {/* Área: imágenes por día */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Imágenes recibidas — últimos 30 días</h3>
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data.byDay} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}
              labelStyle={{ color: '#6b7280' }}
              itemStyle={{ color: '#1d4ed8' }}
              cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Imágenes"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorCount)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Donut: distribución por estado */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Distribución por estado</h3>
          <p className="text-xs text-gray-400 mb-4">{total.toLocaleString('es-MX')} imágenes en total</p>
          {total > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={byState}
                  cx="45%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="state"
                  stroke="none"
                >
                  {byState.map(entry => (
                    <Cell key={entry.state} fill={STATE_COLORS[entry.state] ?? '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    `${Number(value).toLocaleString('es-MX')} (${Math.round(Number(value) / total * 100)}%)`,
                    STATE_LABELS[name as string] ?? name,
                  ]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Legend
                  formatter={name => STATE_LABELS[name] ?? name}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: '#6b7280' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin datos aún</div>
          )}
        </div>

        {/* Barras horizontales: top operadores por tasa de rechazo */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Top operadores — tasa de rechazo</h3>
          <p className="text-xs text-gray-400 mb-4">Manipuladas + Inválidas / Total</p>
          {data.topRejected.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={data.topRejected}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#374151' }}
                  tickLine={false}
                  axisLine={false}
                  width={88}
                />
                <Tooltip
                  formatter={(value, _name, props) => [
                    `${value}% (${props.payload.rechazadas}/${props.payload.total})`,
                    'Tasa de rechazo',
                  ]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Bar dataKey="tasa" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right' as const, fontSize: 11, fill: '#9ca3af', formatter: (v: unknown) => v != null ? `${v}%` : '' }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin suficientes datos</div>
          )}
        </div>

      </div>
    </div>
  )
}
