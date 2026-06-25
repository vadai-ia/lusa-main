'use client'

import dynamic from 'next/dynamic'

const MetricsCharts = dynamic(() => import('./MetricsCharts'), { ssr: false })

export default function MetricsChartsWrapper() {
  return <MetricsCharts />
}
