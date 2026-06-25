'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  src: string
  href?: string
}

export default function ImageThumb({ src, href }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <span className="text-gray-400 text-xs">Sin imagen</span>
  }

  const img = (
    <img
      src={src}
      alt="imagen"
      className="w-14 h-14 object-cover rounded-lg border border-gray-200 hover:opacity-75 transition-opacity"
      onError={() => setFailed(true)}
    />
  )

  if (href) return <Link href={href}>{img}</Link>

  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      {img}
    </a>
  )
}
