'use client'

import React, { createContext, useContext, useState } from 'react'
import type { DesignationFilter } from '@/lib/designation-filter'

interface CtxValue {
  filter: DesignationFilter
  setFilter: (f: DesignationFilter) => void
}

const DesignationFilterCtx = createContext<CtxValue>({ filter: 'all', setFilter: () => {} })

export function DesignationFilterProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<DesignationFilter>('all')
  return (
    <DesignationFilterCtx.Provider value={{ filter, setFilter }}>
      {children}
    </DesignationFilterCtx.Provider>
  )
}

export function useDesignationFilter() {
  return useContext(DesignationFilterCtx)
}
