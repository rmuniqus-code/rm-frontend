'use client'

import { useState, useCallback, useEffect } from 'react'
import { apiRaw } from '@/lib/api'
import { useDesignationFilter } from '@/components/shared/designation-filter-context'

export interface CpProject {
  name: string
  allocPct: number
  status: string
  projectType: string
}

export interface CpEmployee {
  empId: string
  internalId: string
  name: string
  email: string
  department: string
  subFunction: string
  region: string
  location: string
  designation: string
  employeeStatus: string
  dateOfJoining: string | null
  period: string
  availableHours: number
  chargeableHours: number
  nonChargeableHours: number
  chargeabilityPct: number   // 0–100
  compliancePct: number      // 0–100
  currentProjects: CpProject[]
}

export interface CpData {
  period: string | null
  availablePeriods: string[]
  employees: CpEmployee[]
  weekRange: { start: string; end: string } | null
}

const EMPTY: CpData = { period: null, availablePeriods: [], employees: [], weekRange: null }

export function useChargeabilityPerformance(period?: string) {
  const [data, setData] = useState<CpData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { filter: designationGroup } = useDesignationFilter()

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (period) params.set('period', period)
      if (designationGroup !== 'all') params.set('designationGroup', designationGroup)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const res = await apiRaw(`/api/chargeability-performance${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as CpData
      setData(json)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [period, designationGroup])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refresh: fetch }
}
