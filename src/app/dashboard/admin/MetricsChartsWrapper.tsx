'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const MetricsCharts = dynamic(() => import('./MetricsCharts'), { ssr: false })

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

export default function MetricsChartsWrapper() {
  return (
    <Suspense fallback={<Skeleton />}>
      <MetricsCharts />
    </Suspense>
  )
}
