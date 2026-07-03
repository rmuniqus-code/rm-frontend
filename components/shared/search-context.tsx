'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

interface SearchContextValue {
  globalSearch: string
  setGlobalSearch: (q: string) => void
  clearGlobalSearch: () => void
}

const SearchContext = createContext<SearchContextValue>({
  globalSearch: '',
  setGlobalSearch: () => {},
  clearGlobalSearch: () => {},
})

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [globalSearch, setGlobalSearchRaw] = useState('')

  const setGlobalSearch = useCallback((q: string) => setGlobalSearchRaw(q), [])
  const clearGlobalSearch = useCallback(() => setGlobalSearchRaw(''), [])

  return (
    <SearchContext.Provider value={{ globalSearch, setGlobalSearch, clearGlobalSearch }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useGlobalSearch() {
  return useContext(SearchContext)
}
