'use client'

import { useState, useCallback, useEffect } from 'react'
import { apiRaw } from '@/lib/api'

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

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await apiRaw(`/api/chargeability-performance${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as CpData
      // Partner/Director chargeability is not tracked in timesheets — force to 0
      const isPD = (d: string) => /partner|director/i.test(d ?? '')
      json.employees = json.employees.map(e =>
        isPD(e.designation)
          ? { ...e, chargeabilityPct: 0, chargeableHours: 0 }
          : e
      )
      setData(json)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refresh: fetch }
}
