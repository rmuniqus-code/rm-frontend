'use client'

import React, { useState } from 'react'
import styled from 'styled-components'
import ChargeabilityDashboard from '@/components/chargeability/chargeability-dashboard'

const PageWrap = styled.div`
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
`
const PageHeader = styled.div`
  margin-bottom: 20px;
  h1 { font-size: 22px; font-weight: 800; color: var(--color-primary); margin: 0 0 4px; }
  p  { font-size: 13px; color: var(--color-text-secondary); margin: 0; }
`

export default function ChargeabilityPerformancePage() {
  const [period, setPeriod] = useState<string | undefined>(undefined)

  return (
    <PageWrap>
      <PageHeader>
        <h1>Chargeability &amp; Performance</h1>
        <p>Detailed chargeability analysis across service lines, locations, and designations</p>
      </PageHeader>
      <ChargeabilityDashboard
        externalPeriod={period}
        onPeriodChange={setPeriod}
        hidePeriodSelector={false}
      />
    </PageWrap>
  )
}
